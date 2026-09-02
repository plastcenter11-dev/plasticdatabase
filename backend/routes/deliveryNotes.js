const router = require('express').Router();
const { DeliveryNote, DeliveryNoteItem, Customer, Item, SalesInvoice, SalesInvoiceItem, Stock, StockMovement, sequelize } = require('../models');
const { closedYearError } = require('../utils/financialYear');

router.get('/', async (req, res) => {
  try {
    res.json(await DeliveryNote.findAll({
      include: [{ model: Customer, attributes: ['id', 'name'] }, { model: DeliveryNoteItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name', 'sale_price'] }] }],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const n = await DeliveryNote.findByPk(req.params.id, { include: [Customer, { model: DeliveryNoteItem, as: 'items', include: [Item] }] });
    if (!n) return res.status(404).json({ error: 'غير موجود' });
    res.json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    const max = await DeliveryNote.max('id') || 0;
    data.note_no = max + 1;
    const note = await DeliveryNote.create(data, { transaction: t });
    if (items?.length) await DeliveryNoteItem.bulkCreate(items.map(i => ({ ...i, note_id: note.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await DeliveryNote.findByPk(note.id, { include: [{ model: DeliveryNoteItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const note = await DeliveryNote.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'غير موجود' });
    await note.update(req.body);
    res.json(note);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/deliver', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // Lock the row to prevent race conditions
    const note = await DeliveryNote.findByPk(req.params.id, {
      include: [{ model: DeliveryNoteItem, as: 'items', include: [Item] }],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!note) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (note.status === 'delivered') { await t.rollback(); return res.status(400).json({ error: 'تم ترحيل هذا الإذن مسبقاً' }); }
    const closedErr = await closedYearError(note.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }

    const { invoice_no, warehouse_id, items: pricedItems } = req.body;
    const effectiveWarehouseId = warehouse_id ? Number(warehouse_id) : note.warehouse_id;

    // Prices are entered at delivery/posting time, keyed by delivery-note item id
    const priceMap = {}, taxMap = {};
    (pricedItems || []).forEach(pi => {
      priceMap[pi.item_id] = Number(pi.price || 0);
      if (pi.tax_rate) taxMap[pi.item_id] = Number(pi.tax_rate);
    });

    const invMax = await SalesInvoice.max('id', { transaction: t }) || 0;
    const invoiceNumber = invoice_no || `SI-${String(invMax + 1).padStart(6, '0')}`;
    const items = note.items || [];
    const invoiceItems = items.map(i => {
      const weight = Number(i.net_weight || i.gross_weight || 0);
      const rollCount = Number(i.roll_count || 0);
      const price = priceMap[i.item_id] || 0;
      const taxRate = taxMap[i.item_id] || 0;
      return { item_id: i.item_id, quantity: rollCount, weight, price, tax_rate: taxRate || null, total: weight * price * (1 + taxRate / 100) };
    });
    const subtotal = invoiceItems.reduce((s, i) => s + i.weight * i.price, 0);
    const taxTotal = invoiceItems.reduce((s, i) => s + i.weight * i.price * (i.tax_rate || 0) / 100, 0);
    const total = subtotal + taxTotal;

    const inv = await SalesInvoice.create({
      invoice_no: invoiceNumber, date: note.date, customer_id: note.customer_id,
      delivery_note_id: note.id, warehouse_id: effectiveWarehouseId, status: 'posted',
      subtotal, tax_amount: taxTotal, total, remaining: total,
    }, { transaction: t });

    if (invoiceItems.length) {
      await SalesInvoiceItem.bulkCreate(invoiceItems.map(i => ({ ...i, invoice_id: inv.id, discount: 0 })), { transaction: t });
    }

    if (note.customer_id) {
      const customer = await Customer.findByPk(note.customer_id, { transaction: t });
      if (customer) await customer.update({ balance: Number(customer.balance || 0) + total }, { transaction: t });
    }

    // Decrement stock for each delivered item
    if (effectiveWarehouseId) {
      for (const item of items) {
        const weight = Number(item.net_weight || item.gross_weight || 0);
        const rollCount = Number(item.roll_count || 0);
        if (weight <= 0 && rollCount <= 0) continue;
        const price = priceMap[item.item_id] || 0;
        const [stock] = await Stock.findOrCreate({
          where: { item_id: item.item_id, warehouse_id: effectiveWarehouseId },
          defaults: { quantity: 0, weight: 0 },
          transaction: t,
        });
        await stock.update({ quantity: Number(stock.quantity) - rollCount, weight: Number(stock.weight || 0) - weight }, { transaction: t });
        if (price > 0) await Item.update({ sale_price: price }, { where: { id: item.item_id }, transaction: t });
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: effectiveWarehouseId,
          movement_type: 'فاتورة بيع', quantity: rollCount, weight,
          unit_price: price, date: note.date,
          description: `إذن تسليم رقم ${note.note_no}`, reference: String(note.note_no),
        }, { transaction: t });
      }
    }

    await note.update({ status: 'delivered', invoice_no: invoiceNumber, warehouse_id: effectiveWarehouseId }, { transaction: t });
    await t.commit();

    res.json({ message: 'تم الترحيل', invoice_id: inv.id, invoice_no: invoiceNumber });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const n = await DeliveryNote.findByPk(req.params.id);
    if (!n) return res.status(404).json({ error: 'غير موجود' });
    if (n.status === 'delivered') return res.status(400).json({ error: 'لا يمكن حذف إذن تم ترحيله' });
    await n.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

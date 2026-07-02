const router = require('express').Router();
const { DeliveryNote, DeliveryNoteItem, DeliveryNoteOrder, Customer, Item, SalesOrder, SalesOrderItem, SalesInvoice, SalesInvoiceItem, sequelize } = require('../models');

router.get('/', async (req, res) => {
  try {
    res.json(await DeliveryNote.findAll({
      include: [{ model: Customer, attributes: ['id', 'name'] }, { model: DeliveryNoteItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }, { model: SalesOrder, attributes: ['id', 'order_no'] }],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const n = await DeliveryNote.findByPk(req.params.id, { include: [Customer, { model: DeliveryNoteItem, as: 'items', include: [Item] }, SalesOrder] });
    if (!n) return res.status(404).json({ error: 'غير موجود' });
    res.json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { items, linked_orders, ...data } = req.body;
    const count = await DeliveryNote.count();
    data.note_no = count + 1;
    const note = await DeliveryNote.create(data);
    if (items?.length) await DeliveryNoteItem.bulkCreate(items.map(i => ({ ...i, note_id: note.id })));
    if (linked_orders?.length) {
      await DeliveryNoteOrder.bulkCreate(linked_orders.map(orderId => ({ note_id: note.id, order_id: orderId })));
    }
    res.status(201).json(await DeliveryNote.findByPk(note.id, { include: [{ model: DeliveryNoteItem, as: 'items' }, SalesOrder] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    const { invoice_no } = req.body;

    // Get prices from linked sales order items
    const linkedOrders = await DeliveryNoteOrder.findAll({ where: { note_id: note.id }, transaction: t });
    const orderIds = linkedOrders.map(o => o.order_id);
    const orderItems = orderIds.length ? await SalesOrderItem.findAll({ where: { order_id: orderIds }, transaction: t }) : [];
    const priceMap = {}, taxMap = {};
    orderItems.forEach(oi => {
      priceMap[oi.item_id] = Number(oi.price);
      if (oi.tax_rate) taxMap[oi.item_id] = Number(oi.tax_rate);
    });

    const invCount = await SalesInvoice.count({ transaction: t });
    const invoiceNumber = invoice_no || `SI-${String(invCount + 1).padStart(6, '0')}`;
    const items = note.items || [];
    const invoiceItems = items.map(i => {
      const qty = Number(i.net_weight || i.gross_weight || 0);
      const price = priceMap[i.item_id] || 0;
      const taxRate = taxMap[i.item_id] || 0;
      return { item_id: i.item_id, quantity: qty, price, tax_rate: taxRate || null, total: qty * price * (1 + taxRate / 100) };
    });
    const subtotal = invoiceItems.reduce((s, i) => s + i.quantity * i.price, 0);
    const taxTotal = invoiceItems.reduce((s, i) => s + i.quantity * i.price * (i.tax_rate || 0) / 100, 0);
    const total = subtotal + taxTotal;

    const inv = await SalesInvoice.create({
      invoice_no: invoiceNumber, date: note.date, customer_id: note.customer_id,
      delivery_note_id: note.id, status: 'posted',
      subtotal, tax_amount: taxTotal, total, remaining: total,
    }, { transaction: t });

    if (invoiceItems.length) {
      await SalesInvoiceItem.bulkCreate(invoiceItems.map(i => ({ ...i, invoice_id: inv.id, discount: 0 })), { transaction: t });
    }

    if (note.customer_id) {
      const customer = await Customer.findByPk(note.customer_id, { transaction: t });
      if (customer) await customer.update({ balance: Number(customer.balance || 0) + total }, { transaction: t });
    }

    await note.update({ status: 'delivered', invoice_no: invoiceNumber }, { transaction: t });
    await t.commit();

    res.json({ message: 'تم الترحيل', invoice_id: inv.id, invoice_no: invoiceNumber });
  } catch (err) { await t.rollback(); res.status(500).json({ error: err.message }); }
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

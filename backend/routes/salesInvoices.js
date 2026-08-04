const router = require('express').Router();
const { SalesInvoice, SalesInvoiceItem, Customer, Employee, Item, Stock, StockMovement, sequelize } = require('../models');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    res.json(await SalesInvoice.findAll({ where, include: [{ model: Customer, attributes: ['id', 'name'] }, { model: Employee, attributes: ['id', 'name'] }, { model: SalesInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [Customer, Employee, { model: SalesInvoiceItem, as: 'items', include: [Item] }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    res.json(inv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    const max = await SalesInvoice.max('id') || 0;
    data.invoice_no = data.invoice_no || `SI-${String(max + 1).padStart(6, '0')}`;
    const inv = await SalesInvoice.create(data, { transaction: t });
    if (items?.length) await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const { items, ...data } = req.body;
    if (items) {
      await SalesInvoiceItem.destroy({ where: { invoice_id: inv.id }, transaction: t });
      await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    }
    await inv.update(data, { transaction: t });
    await t.commit();
    res.json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [{ model: SalesInvoiceItem, as: 'items' }], transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (inv.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' }); }

    // Check stock availability before posting
    if (inv.warehouse_id) {
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;
        const stock = await Stock.findOne({ where: { item_id: item.item_id, warehouse_id: inv.warehouse_id }, transaction: t });
        const available = stock ? Number(stock.quantity) : 0;
        if (available < qty) {
          await t.rollback();
          return res.status(400).json({ error: `الكمية المتاحة من "${fullItem.name}" (${available}) أقل من الكمية المطلوبة (${qty})` });
        }
      }
    }

    await inv.update({ status: 'posted' }, { transaction: t });

    // Update customer balance by the unpaid remainder of the invoice
    if (inv.customer_id) {
      const customer = await Customer.findByPk(inv.customer_id, { transaction: t });
      if (customer) {
        const remaining = Number(inv.remaining != null ? inv.remaining : Number(inv.total || 0) - Number(inv.paid || 0));
        await customer.update({ balance: Number(customer.balance || 0) + remaining }, { transaction: t });
      }
    }

    // Decrement stock for each item
    if (inv.warehouse_id) {
      const grossTotal = (inv.items || []).reduce((s, it) => s + (Number(it.weight || 0) || Number(it.quantity || 0)) * Number(it.price || 0), 0);
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;
        const wt = Number(item.weight || 0);
        const [stock] = await Stock.findOrCreate({
          where: { item_id: item.item_id, warehouse_id: inv.warehouse_id },
          defaults: { quantity: 0, weight: 0 },
          transaction: t,
        });
        await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });

        // Effective sale price = item revenue net of its own discount, plus its
        // proportional share of the invoice-level discount and tax, per unit weight.
        const unit = wt > 0 ? wt : qty;
        if (unit > 0) {
          const itemGross = unit * Number(item.price || 0);
          const itemNet = Number(item.total || 0);
          const taxShare = grossTotal > 0 ? Number(inv.tax_amount || 0) * (itemGross / grossTotal) : 0;
          const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
          const effectivePrice = (itemNet - discShare + taxShare) / unit;
          if (effectivePrice > 0) await fullItem.update({ sale_price: Math.round(effectivePrice * 100) / 100 }, { transaction: t });
        }
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: inv.warehouse_id,
          movement_type: 'فاتورة بيع', quantity: qty, weight: wt,
          unit_price: Number(item.price || 0), date: inv.date,
          description: `فاتورة بيع ${inv.invoice_no}`, reference: inv.invoice_no,
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ message: 'تم الترحيل' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    if (inv.status === 'posted') return res.status(400).json({ error: 'لا يمكن حذف فاتورة مرحّلة' });
    await inv.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    await SalesInvoice.destroy({ where: { id: ids } });
    res.json({ message: `تم حذف ${ids.length} فاتورة` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

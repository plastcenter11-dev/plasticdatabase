const router = require('express').Router();
const { PurchaseInvoice, PurchaseInvoiceItem, Supplier, Item, Stock, StockMovement, CashPayment, sequelize } = require('../models');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    res.json(await PurchaseInvoice.findAll({ where, include: [{ model: Supplier, attributes: ['id', 'name'] }, { model: PurchaseInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id, { include: [Supplier, { model: PurchaseInvoiceItem, as: 'items', include: [Item] }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    res.json(inv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    if (!data.supplier_id) { await t.rollback(); return res.status(400).json({ error: 'المورد مطلوب' }); }
    const max = await PurchaseInvoice.max('id') || 0;
    data.invoice_no = data.invoice_no || `PI-${String(max + 1).padStart(6, '0')}`;
    const inv = await PurchaseInvoice.create(data, { transaction: t });
    if (items?.length) await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id, { transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const { items, ...data } = req.body;
    if (items) {
      await PurchaseInvoiceItem.destroy({ where: { invoice_id: inv.id }, transaction: t });
      await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    }
    await inv.update(data, { transaction: t });
    await t.commit();
    res.json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }], transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (inv.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' }); }

    await inv.update({ status: 'posted' }, { transaction: t });

    // Update supplier balance: add remaining (total - paid) to balance
    const remaining = Number(inv.total || 0) - Number(inv.paid || 0);
    const supplier = await Supplier.findByPk(inv.supplier_id, { transaction: t });
    if (supplier) {
      await supplier.update({ balance: Number(supplier.balance || 0) + remaining }, { transaction: t });
    }

    // If paid > 0, create a cash payment record
    const paidAmt = Number(inv.paid || 0);
    if (paidAmt > 0) {
      const cpMax = await CashPayment.max('id', { transaction: t }) || 0;
      await CashPayment.create({
        payment_no: `CP-${String(cpMax + 1).padStart(6, '0')}`,
        date: inv.date,
        supplier_id: inv.supplier_id,
        amount: paidAmt,
        payment_method: 'نقدي',
        notes: `دفعة فاتورة شراء ${inv.invoice_no}`,
      }, { transaction: t });
    }

    // Increment stock for each item
    if (inv.warehouse_id) {
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        const wt = Number(item.weight || 0);
        if (qty <= 0 && wt <= 0) continue;
        const [stock] = await Stock.findOrCreate({
          where: { item_id: item.item_id, warehouse_id: inv.warehouse_id },
          defaults: { quantity: 0, weight: 0 },
          transaction: t,
        });
        await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });
        if (Number(item.price || 0) > 0) await fullItem.update({ purchase_price: Number(item.price) }, { transaction: t });
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: inv.warehouse_id,
          movement_type: 'فاتورة شراء', quantity: qty, weight: wt,
          unit_price: Number(item.price || 0), date: inv.date,
          description: `فاتورة شراء ${inv.invoice_no}`, reference: inv.invoice_no,
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ message: 'تم الترحيل' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    if (inv.status === 'posted') return res.status(400).json({ error: 'لا يمكن حذف فاتورة مرحّلة' });
    await inv.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    await PurchaseInvoice.destroy({ where: { id: ids } });
    res.json({ message: `تم حذف ${ids.length} فاتورة` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/supplier/:supplierId', async (req, res) => {
  try {
    res.json(await PurchaseInvoice.findAll({
      where: { supplier_id: req.params.supplierId },
      include: [{ model: PurchaseInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

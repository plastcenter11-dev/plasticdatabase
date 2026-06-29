const router = require('express').Router();
const { PurchaseInvoice, PurchaseInvoiceItem, Supplier, Item } = require('../models');

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
  try {
    const { items, ...data } = req.body;
    const count = await PurchaseInvoice.count();
    data.invoice_no = data.invoice_no || `PI-${String(count + 1).padStart(6, '0')}`;
    const inv = await PurchaseInvoice.create(data);
    if (items?.length) await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    res.status(201).json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    const { items, ...data } = req.body;
    if (items) {
      await PurchaseInvoiceItem.destroy({ where: { invoice_id: inv.id } });
      await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    }
    await inv.update(data);
    res.json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    await inv.update({ status: 'posted' });
    const supplier = await Supplier.findByPk(inv.supplier_id);
    if (supplier) await supplier.update({ balance: Number(supplier.balance) + Number(inv.remaining) });
    res.json({ message: 'تم الترحيل' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
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

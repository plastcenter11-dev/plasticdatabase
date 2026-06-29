const router = require('express').Router();
const { PurchaseReturn, PurchaseReturnItem, SalesReturn, SalesReturnItem, Supplier, Customer, Item, PurchaseInvoice, SalesInvoice } = require('../models');

// Purchase Returns
router.get('/purchase', async (req, res) => {
  try {
    res.json(await PurchaseReturn.findAll({ include: [Supplier, { model: PurchaseReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/purchase', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await PurchaseReturn.count();
    data.return_no = `PR-${String(count + 1).padStart(6, '0')}`;
    data.total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
    const ret = await PurchaseReturn.create(data);
    if (items?.length) await PurchaseReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id, total: Number(i.quantity) * Number(i.price) })));
    res.status(201).json(await PurchaseReturn.findByPk(ret.id, { include: [{ model: PurchaseReturnItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/purchase/:id', async (req, res) => {
  try {
    const r = await PurchaseReturn.findByPk(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    await r.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sales Returns
router.get('/sales', async (req, res) => {
  try {
    res.json(await SalesReturn.findAll({ include: [Customer, { model: SalesReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sales', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await SalesReturn.count();
    data.return_no = `SR-${String(count + 1).padStart(6, '0')}`;
    data.total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
    const ret = await SalesReturn.create(data);
    if (items?.length) await SalesReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id, total: Number(i.quantity) * Number(i.price) })));
    res.status(201).json(await SalesReturn.findByPk(ret.id, { include: [{ model: SalesReturnItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sales/:id', async (req, res) => {
  try {
    const r = await SalesReturn.findByPk(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    await r.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

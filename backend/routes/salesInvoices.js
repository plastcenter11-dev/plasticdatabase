const router = require('express').Router();
const { SalesInvoice, SalesInvoiceItem, Customer, Employee, Item, Stock } = require('../models');

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
  try {
    const { items, ...data } = req.body;
    const count = await SalesInvoice.count();
    data.invoice_no = data.invoice_no || `SI-${String(count + 1).padStart(6, '0')}`;
    const inv = await SalesInvoice.create(data);
    if (items?.length) await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    res.status(201).json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    const { items, ...data } = req.body;
    if (items) {
      await SalesInvoiceItem.destroy({ where: { invoice_id: inv.id } });
      await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    }
    await inv.update(data);
    res.json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    await inv.update({ status: 'posted' });
    const customer = await Customer.findByPk(inv.customer_id);
    if (customer) await customer.update({ balance: Number(customer.balance) + Number(inv.remaining) });
    res.json({ message: 'تم الترحيل' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
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

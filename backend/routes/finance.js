const router = require('express').Router();
const { CashReceipt, CashPayment, Check, Expense, OtherIncome, Customer, Supplier } = require('../models');
const { Op } = require('sequelize');

// Cash Receipts
router.get('/cash-receipts', async (req, res) => {
  try { res.json(await CashReceipt.findAll({ include: [{ model: Customer, attributes: ['id', 'name'] }], order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cash-receipts', async (req, res) => {
  try {
    const count = await CashReceipt.count();
    req.body.receipt_no = `CR-${String(count + 1).padStart(6, '0')}`;
    const r = await CashReceipt.create(req.body);
    const customer = await Customer.findByPk(r.customer_id);
    if (customer) await customer.update({ balance: Number(customer.balance) - Number(r.amount) });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cash-receipts/:id', async (req, res) => {
  try {
    const r = await CashReceipt.findByPk(req.params.id);
    if (!r) return res.status(404).json({ error: 'غير موجود' });
    const customer = await Customer.findByPk(r.customer_id);
    if (customer) await customer.update({ balance: Number(customer.balance) + Number(r.amount) });
    await r.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cash Payments
router.get('/cash-payments', async (req, res) => {
  try { res.json(await CashPayment.findAll({ include: [{ model: Supplier, attributes: ['id', 'name'] }], order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cash-payments', async (req, res) => {
  try {
    const count = await CashPayment.count();
    req.body.payment_no = `CP-${String(count + 1).padStart(6, '0')}`;
    const p = await CashPayment.create(req.body);
    const supplier = await Supplier.findByPk(p.supplier_id);
    if (supplier) await supplier.update({ balance: Number(supplier.balance) - Number(p.amount) });
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cash-payments/:id', async (req, res) => {
  try {
    const p = await CashPayment.findByPk(req.params.id);
    if (!p) return res.status(404).json({ error: 'غير موجود' });
    const supplier = await Supplier.findByPk(p.supplier_id);
    if (supplier) await supplier.update({ balance: Number(supplier.balance) + Number(p.amount) });
    await p.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Checks
router.get('/checks', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    res.json(await Check.findAll({ where, order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/checks', async (req, res) => {
  try { res.status(201).json(await Check.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/checks/:id', async (req, res) => {
  try {
    const c = await Check.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.update(req.body);
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/checks/:id', async (req, res) => {
  try {
    const c = await Check.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/checks/overdue', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    res.json(await Check.findAll({ where: { status: 'pending', due_date: { [Op.lt]: today } }, order: [['due_date', 'ASC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Expenses
router.get('/expenses', async (req, res) => {
  try { res.json(await Expense.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses', async (req, res) => {
  try { res.status(201).json(await Expense.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const e = await Expense.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    await e.update(req.body);
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const e = await Expense.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    await e.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Other Income
router.get('/other-income', async (req, res) => {
  try { res.json(await OtherIncome.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/other-income', async (req, res) => {
  try { res.status(201).json(await OtherIncome.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/other-income/:id', async (req, res) => {
  try {
    const o = await OtherIncome.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    await o.update(req.body);
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/other-income/:id', async (req, res) => {
  try {
    const o = await OtherIncome.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    await o.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

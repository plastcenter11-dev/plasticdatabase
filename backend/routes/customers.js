const router = require('express').Router();
const { Customer, SalesInvoice, CashReceipt } = require('../models');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    res.json(await Customer.findAll({ where, order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Customer.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.update(req.body);
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/statement', async (req, res) => {
  try {
    const invoices = await SalesInvoice.findAll({ where: { customer_id: req.params.id, status: 'posted' }, order: [['date', 'ASC']] });
    const receipts = await CashReceipt.findAll({ where: { customer_id: req.params.id }, order: [['date', 'ASC']] });
    const movements = [
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة بيع', reference: i.invoice_no, debit: Number(i.total), credit: 0 })),
      ...receipts.map(r => ({ date: r.date, type: 'تحصيل', reference: r.receipt_no, debit: 0, credit: Number(r.amount) })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = 0;
    movements.forEach(m => { balance += m.debit - m.credit; m.balance = balance; });
    res.json(movements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

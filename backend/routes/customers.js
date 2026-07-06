const router = require('express').Router();
const { Customer, SalesInvoice, CashReceipt, sequelize } = require('../models');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const customers = await Customer.findAll({ where, order: [['id', 'DESC']] });

    // Calculate real balance for each customer from invoices - receipts
    const ids = customers.map(c => c.id);
    if (ids.length === 0) return res.json([]);

    const [invoiceSums] = await sequelize.query(
      `SELECT customer_id, COALESCE(SUM(total),0) as total FROM sales_invoices WHERE status='posted' AND customer_id IN (${ids.join(',')}) GROUP BY customer_id`
    );
    const [receiptSums] = await sequelize.query(
      `SELECT customer_id, COALESCE(SUM(amount),0) as total FROM cash_receipts WHERE customer_id IN (${ids.join(',')}) GROUP BY customer_id`
    );

    const invMap = {}, recMap = {};
    invoiceSums.forEach(r => { invMap[r.customer_id] = Number(r.total); });
    receiptSums.forEach(r => { recMap[r.customer_id] = Number(r.total); });

    const result = customers.map(c => ({
      ...c.toJSON(),
      balance: Math.round(((invMap[c.id] || 0) - (recMap[c.id] || 0)) * 100) / 100,
    }));
    res.json(result);
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
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة بيع', reference: i.invoice_no, debit: Number(i.total), credit: 0, invoice_id: i.id })),
      ...receipts.map(r => ({ date: r.date, type: 'تحصيل', reference: r.receipt_no, debit: 0, credit: Number(r.amount) })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = 0;
    movements.forEach(m => { balance += m.debit - m.credit; m.balance = balance; });
    res.json(movements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

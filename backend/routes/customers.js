const router = require('express').Router();
const { Customer, SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, Item, CashReceipt, OpeningBalance, sequelize } = require('../models');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const customers = await Customer.findAll({ where, order: [['id', 'DESC']] });

    // Calculate real balance for each customer from invoices - receipts - returns + opening balance
    const ids = customers.map(c => c.id);
    if (ids.length === 0) return res.json([]);

    const [invoiceSums] = await sequelize.query(
      `SELECT customer_id, COALESCE(SUM(total),0) as total FROM sales_invoices WHERE status='posted' AND customer_id IN (${ids.join(',')}) GROUP BY customer_id`
    );
    const [receiptSums] = await sequelize.query(
      `SELECT customer_id, COALESCE(SUM(amount),0) as total FROM cash_receipts WHERE customer_id IN (${ids.join(',')}) GROUP BY customer_id`
    );
    const [returnSums] = await sequelize.query(
      `SELECT customer_id, COALESCE(SUM(total),0) as total FROM sales_returns WHERE customer_id IN (${ids.join(',')}) GROUP BY customer_id`
    );
    const [openingSums] = await sequelize.query(
      `SELECT party_id, COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) as total FROM opening_balances WHERE party_type='customer' AND party_id IN (${ids.join(',')}) GROUP BY party_id`
    );

    const invMap = {}, recMap = {}, retMap = {}, openMap = {};
    invoiceSums.forEach(r => { invMap[r.customer_id] = Number(r.total); });
    receiptSums.forEach(r => { recMap[r.customer_id] = Number(r.total); });
    returnSums.forEach(r => { retMap[r.customer_id] = Number(r.total); });
    openingSums.forEach(r => { openMap[r.party_id] = Number(r.total); });

    const result = customers.map(c => ({
      ...c.toJSON(),
      balance: Math.round(((invMap[c.id] || 0) - (recMap[c.id] || 0) - (retMap[c.id] || 0) + (openMap[c.id] || 0)) * 100) / 100,
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
    const invoices = await SalesInvoice.findAll({
      where: { customer_id: req.params.id, status: 'posted' },
      include: [{ model: SalesInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'name', 'code'] }] }],
      order: [['date', 'ASC']],
    });
    const receipts = await CashReceipt.findAll({ where: { customer_id: req.params.id }, order: [['date', 'ASC']] });
    const returns = await SalesReturn.findAll({
      where: { customer_id: req.params.id },
      include: [{ model: SalesReturnItem, as: 'items', include: [{ model: Item, attributes: ['id', 'name', 'code'] }] }],
      order: [['date', 'ASC']],
    });
    const opening = await OpeningBalance.findAll({ where: { party_type: 'customer', party_id: req.params.id } });
    const openingTotal = opening.reduce((sum, o) => sum + Number(o.debit || 0) - Number(o.credit || 0), 0);
    const movements = [
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة بيع', reference: i.invoice_no, debit: Number(i.total), credit: 0, invoice_id: i.id, items: i.items, subtotal: Number(i.subtotal || 0), discount: Number(i.discount || 0), tax_rate: Number(i.tax_rate || 0), tax_amount: Number(i.tax_amount || 0) })),
      ...receipts.map(r => ({ date: r.date, type: 'تحصيل', reference: r.receipt_no, debit: 0, credit: Number(r.amount) })),
      ...returns.map(r => ({ date: r.date, type: 'مرتجع بيع', reference: r.return_no, debit: 0, credit: Number(r.total), items: r.items, subtotal: Number(r.total) - Number(r.tax_amount || 0), discount: 0, tax_rate: Number(r.tax_rate || 0), tax_amount: Number(r.tax_amount || 0) })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = openingTotal;
    if (openingTotal) movements.unshift({ date: null, type: 'رصيد افتتاحي', reference: '-', debit: 0, credit: 0, balance: openingTotal, isOpening: true });
    movements.forEach(m => { if (!m.isOpening) { balance += m.debit - m.credit; m.balance = balance; } });
    res.json(movements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

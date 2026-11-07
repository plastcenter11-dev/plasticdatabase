const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const { Customer, SalesInvoice, SalesInvoiceItem, SalesReturn, SalesReturnItem, Item, CashReceipt, OpeningBalance, Check, sequelize } = require('../models');
const { Op } = require('sequelize');

// each customer with the balance computed live: posted invoices - receipts - returns - checks + opening
async function withBalances(customers) {
  // Calculate real balance for each customer from invoices - receipts - returns + opening balance
  const ids = customers.map(c => c.id);
  if (ids.length === 0) return [];

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
  const [checkSums] = await sequelize.query(
    `SELECT party_id, COALESCE(SUM(amount),0) as total FROM checks WHERE party_type='customer' AND status != 'bounced' AND party_id IN (${ids.join(',')}) GROUP BY party_id`
  );

  const invMap = {}, recMap = {}, retMap = {}, openMap = {}, checkMap = {};
  invoiceSums.forEach(r => { invMap[r.customer_id] = Number(r.total); });
  receiptSums.forEach(r => { recMap[r.customer_id] = Number(r.total); });
  returnSums.forEach(r => { retMap[r.customer_id] = Number(r.total); });
  openingSums.forEach(r => { openMap[r.party_id] = Number(r.total); });
  checkSums.forEach(r => { checkMap[r.party_id] = Number(r.total); });

  const result = customers.map(c => ({
    ...c.toJSON(),
    balance: Math.round(((invMap[c.id] || 0) - (recMap[c.id] || 0) - (retMap[c.id] || 0) - (checkMap[c.id] || 0) + (openMap[c.id] || 0)) * 100) / 100,
  }));
  return result;
}

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const customers = await Customer.findAll({ where, order: [['id', 'DESC']] });
    res.json(await withBalances(customers));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Customers who stopped buying but still owe: no posted invoice for `days` days (or ever) and a balance of
// at least `min_balance`, biggest debt first.
router.get('/silent', async (req, res) => {
  try {
    const days = Math.max(parseInt(req.query.days, 10) || 60, 1);
    const minBalance = Number(req.query.min_balance) > 0 ? Number(req.query.min_balance) : 1;
    const customers = await withBalances(await Customer.findAll());
    const debtors = customers.filter(c => c.balance >= minBalance);
    if (!debtors.length) return res.json({ days, min_balance: minBalance, total: 0, rows: [] });
    const ids = debtors.map(c => c.id).join(',');
    const [lastInvoices] = await sequelize.query(`SELECT customer_id, MAX(date) AS last_date FROM sales_invoices WHERE status='posted' AND customer_id IN (${ids}) GROUP BY customer_id`);
    const [lastReceipts] = await sequelize.query(`SELECT customer_id, MAX(date) AS last_date FROM cash_receipts WHERE customer_id IN (${ids}) GROUP BY customer_id`);
    const lastInvoice = Object.fromEntries(lastInvoices.map(r => [r.customer_id, r.last_date]));
    const lastReceipt = Object.fromEntries(lastReceipts.map(r => [r.customer_id, r.last_date]));
    const today = new Date(new Date().toISOString().slice(0, 10));
    const daysSince = (d) => (d ? Math.floor((today - new Date(d)) / 86400000) : null);
    const rows = debtors
      .map(c => ({
        id: c.id, name: c.name, phone: c.phone || '', balance: c.balance,
        last_purchase: lastInvoice[c.id] || null, days_silent: daysSince(lastInvoice[c.id]), last_receipt: lastReceipt[c.id] || null,
      }))
      .filter(r => r.last_purchase === null || r.days_silent >= days)
      .sort((x, y) => y.balance - x.balance);
    res.json({ days, min_balance: minBalance, total: Math.round(rows.reduce((sum, r) => sum + r.balance, 0) * 100) / 100, rows });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    res.json(c);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Customer.create(req.body)); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.update(req.body);
    res.json(c);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const c = await Customer.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/:id/statement', async (req, res) => {
  try {
    const { from, to } = req.query;
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
    const checks = await Check.findAll({ where: { party_type: 'customer', party_id: req.params.id }, order: [['date', 'ASC']] });
    const allMovements = [
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة بيع', reference: i.invoice_no, debit: Number(i.total), credit: 0, invoice_id: i.id, items: i.items, subtotal: Number(i.subtotal || 0), discount: Number(i.discount || 0), tax_rate: Number(i.tax_rate || 0), tax_amount: Number(i.tax_amount || 0) })),
      ...receipts.map(r => ({ date: r.date, type: r.payment_method === 'خصم نقدي' ? 'خصم نقدي' : 'تحصيل', reference: r.receipt_no, debit: 0, credit: Number(r.amount) })),
      ...returns.map(r => ({ date: r.date, type: 'مرتجع بيع', reference: r.return_no, debit: 0, credit: Number(r.total), items: r.items, subtotal: Number(r.total) - Number(r.tax_amount || 0), discount: 0, tax_rate: Number(r.tax_rate || 0), tax_amount: Number(r.tax_amount || 0) })),
      ...checks.flatMap(c => {
        const rows = [{ date: c.date, type: 'شيك', reference: c.check_no, debit: 0, credit: Number(c.amount), check_due_date: c.due_date, check_status: c.status }];
        if (c.status === 'bounced') {
          rows.push({ date: c.bounced_date || c.date, type: 'شيك مرتد', reference: c.check_no, debit: Number(c.amount), credit: 0, check_bounced_date: c.bounced_date || c.date });
        }
        return rows;
      }),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Everything dated before `from` is folded into a single carried-forward
    // opening balance, so the running balance column stays correct even
    // though only movements inside [from, to] are actually listed.
    const before = from ? allMovements.filter(m => m.date < from) : [];
    const inRange = allMovements.filter(m => (!from || m.date >= from) && (!to || m.date <= to));
    const carryForward = openingTotal + before.reduce((sum, m) => sum + m.debit - m.credit, 0);

    let balance = carryForward;
    const movements = [...inRange];
    if (carryForward || from) movements.unshift({ date: null, type: from ? 'رصيد مرحّل' : 'رصيد افتتاحي', reference: '-', debit: 0, credit: 0, balance: carryForward, isOpening: true });
    movements.forEach(m => { if (!m.isOpening) { balance += m.debit - m.credit; m.balance = balance; } });
    res.json(movements);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

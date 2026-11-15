const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const { CashReceipt, CashPayment, Check, Expense, OtherIncome, Customer, Supplier, SalesInvoice, PurchaseInvoice, sequelize } = require('../models');
const { Op } = require('sequelize');
const { closedYearError } = require('../utils/financialYear');
const { clean } = require('../utils/clean');
const { nextNumber } = require('../utils/numbering');
const { bump } = require('../utils/balances');

// A check counts as an actual payment the moment it's registered, unless it bounced.
async function applyCheckBalance(check, sign, t) {
  if (check.status === 'bounced') return;
  await bump(check.party_type === 'customer' ? Customer : Supplier, check.party_id, sign * Number(check.amount), t);
}

// Every money amount has to be a positive number: zero or negative amounts would quietly move a
// balance the wrong way (a negative receipt is a hidden charge).
const amountError = (body) => (Number(body.amount) > 0 ? null : 'المبلغ لازم يكون أكبر من صفر');
const rejectBadAmount = (req, res) => { const e = amountError(req.body); if (e) { res.status(400).json({ error: e }); return true; } return false; };

// A payment typed on an invoice is saved as a receipt/payment noted 'دفعة فاتورة ... <number>'. When
// that receipt/payment is deleted, the invoice must show the money as unpaid again.
async function unpayInvoice(Invoice, prefix, row, partyKey, t) {
  const m = String(row.notes || '').match(new RegExp('^' + prefix + ' (.+)$'));
  if (!m || !row[partyKey]) return;
  const inv = await Invoice.findOne({ where: { invoice_no: m[1], [partyKey]: row[partyKey] }, transaction: t, lock: t.LOCK.UPDATE });
  if (!inv) return;
  const paid = Math.max(0, Number(inv.paid || 0) - Number(row.amount));
  await inv.update({ paid, remaining: Number(inv.total || 0) - paid }, { transaction: t });
}

// Cash Receipts
// cash discounts are stored as receipts/payments with this method but listed apart (?kind=discount)
const DISCOUNT = 'خصم نقدي';
const methodFilter = (req) => ({ payment_method: req.query.kind === 'discount' ? DISCOUNT : { [Op.ne]: DISCOUNT } });

router.get('/cash-receipts', async (req, res) => {
  try { res.json(await CashReceipt.findAll({ where: methodFilter(req), include: [{ model: Customer, attributes: ['id', 'name'] }], order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/cash-receipts', async (req, res) => {
  if (rejectBadAmount(req, res)) return;
  if (!req.body.customer_id) return res.status(400).json({ error: 'العميل مطلوب' });
  const t = await sequelize.transaction();
  try {
    const closedErr = await closedYearError(req.body.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const r = await CashReceipt.create({ ...clean(CashReceipt, req.body, ['receipt_no']), receipt_no: await nextNumber('CR', t) }, { transaction: t });
    await bump(Customer, r.customer_id, -Number(r.amount), t);
    await t.commit();
    res.status(201).json(r);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/cash-receipts/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // locked: deleting the same receipt twice at once must not reverse its balance twice
    const r = await CashReceipt.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!r) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(r.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    await bump(Customer, r.customer_id, Number(r.amount), t);
    await unpayInvoice(SalesInvoice, 'دفعة فاتورة بيع', r, 'customer_id', t);
    await r.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Cash Payments - to a supplier (reduces what we owe) or back to a customer (a refund: raises what
// the customer owes, the opposite of a receipt)
router.get('/cash-payments', async (req, res) => {
  try { res.json(await CashPayment.findAll({ where: methodFilter(req), include: [{ model: Supplier, attributes: ['id', 'name'] }, { model: Customer, attributes: ['id', 'name'] }], order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/cash-payments', async (req, res) => {
  if (rejectBadAmount(req, res)) return;
  const toSupplier = req.body.supplier_id || null;
  const toCustomer = req.body.customer_id || null;
  if (!!toSupplier === !!toCustomer) return res.status(400).json({ error: 'اختر مورد أو عميل (واحد فقط)' });
  const t = await sequelize.transaction();
  try {
    const closedErr = await closedYearError(req.body.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const p = await CashPayment.create({
      ...clean(CashPayment, req.body, ['payment_no']), supplier_id: toSupplier, customer_id: toCustomer, payment_no: await nextNumber('CP', t),
    }, { transaction: t });
    if (p.customer_id) await bump(Customer, p.customer_id, Number(p.amount), t);
    else await bump(Supplier, p.supplier_id, -Number(p.amount), t);
    await t.commit();
    res.status(201).json(p);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/cash-payments/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const p = await CashPayment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!p) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(p.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    if (p.customer_id) await bump(Customer, p.customer_id, -Number(p.amount), t);
    else {
      await bump(Supplier, p.supplier_id, Number(p.amount), t);
      await unpayInvoice(PurchaseInvoice, 'دفعة فاتورة شراء', p, 'supplier_id', t);
    }
    await p.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Checks
router.get('/checks', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    res.json(await Check.findAll({ where, order: [['id', 'DESC']] }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/checks', async (req, res) => {
  if (rejectBadAmount(req, res)) return;
  const t = await sequelize.transaction();
  try {
    const closedErr = await closedYearError(req.body.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const c = await Check.create(clean(Check, req.body, ['status', 'bounced_date']), { transaction: t });
    await applyCheckBalance(c, -1, t);
    await t.commit();
    res.status(201).json(c);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/checks/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const c = await Check.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!c) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (req.body.status === 'bounced' && !req.body.bounced_date) {
      await t.rollback();
      return res.status(400).json({ error: 'أدخل تاريخ ارتداد الشيك' });
    }
    // Block if either the check's current date or its incoming new date falls
    // in a closed year - changing the date is itself a way to move a balance
    // effect into/out of a locked period, so both ends must be checked.
    const closedErr = (await closedYearError(c.date))
      || (req.body.date ? await closedYearError(req.body.date) : null)
      || (req.body.bounced_date ? await closedYearError(req.body.bounced_date) : null);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    await applyCheckBalance(c, 1, t); // reverse old effect
    // Moving away from bounced (e.g. back to pending) leaves a stale
    // bounced_date behind otherwise - clear it so the statement doesn't show
    // a phantom bounce entry if it bounces again with a fresh date later.
    if (req.body.status && req.body.status !== 'bounced') req.body.bounced_date = null;
    await c.update(clean(Check, req.body), { transaction: t });
    await applyCheckBalance(c, -1, t); // reapply with new status/amount/party
    await t.commit();
    res.json(c);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/checks/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const c = await Check.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!c) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(c.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    await applyCheckBalance(c, 1, t);
    await c.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/checks/overdue', async (req, res) => {
  try {
    const today = require('../utils/today').todayStr();
    res.json(await Check.findAll({ where: { status: 'pending', due_date: { [Op.lt]: today } }, order: [['due_date', 'ASC']] }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Expenses
router.get('/expenses', async (req, res) => {
  try { res.json(await Expense.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/expenses', async (req, res) => {
  try {
    if (rejectBadAmount(req, res)) return;
    const closedErr = await closedYearError(req.body.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    res.status(201).json(await Expense.create(clean(Expense, req.body)));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const e = await Expense.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    const closedErr = await closedYearError(req.body.date || e.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    await e.update(clean(Expense, req.body));
    res.json(e);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const e = await Expense.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    const closedErr = await closedYearError(e.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    await e.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Other Income
router.get('/other-income', async (req, res) => {
  try { res.json(await OtherIncome.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/other-income', async (req, res) => {
  try {
    if (rejectBadAmount(req, res)) return;
    const closedErr = await closedYearError(req.body.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    res.status(201).json(await OtherIncome.create(clean(OtherIncome, req.body)));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/other-income/:id', async (req, res) => {
  try {
    const o = await OtherIncome.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    const closedErr = await closedYearError(req.body.date || o.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    await o.update(clean(OtherIncome, req.body));
    res.json(o);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/other-income/:id', async (req, res) => {
  try {
    const o = await OtherIncome.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    const closedErr = await closedYearError(o.date);
    if (closedErr) return res.status(400).json({ error: closedErr });
    await o.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

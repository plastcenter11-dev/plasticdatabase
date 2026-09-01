const router = require('express').Router();
const { Supplier, PurchaseInvoice, PurchaseInvoiceItem, PurchaseReturn, PurchaseReturnItem, Item, CashPayment, OpeningBalance, Check, sequelize } = require('../models');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    const suppliers = await Supplier.findAll({ where, order: [['id', 'DESC']] });

    const ids = suppliers.map(s => s.id);
    if (ids.length === 0) return res.json([]);

    const [invoiceSums] = await sequelize.query(
      `SELECT supplier_id, COALESCE(SUM(total),0) as total FROM purchase_invoices WHERE status='posted' AND supplier_id IN (${ids.join(',')}) GROUP BY supplier_id`
    );
    const [paymentSums] = await sequelize.query(
      `SELECT supplier_id, COALESCE(SUM(amount),0) as total FROM cash_payments WHERE supplier_id IN (${ids.join(',')}) GROUP BY supplier_id`
    );
    const [returnSums] = await sequelize.query(
      `SELECT supplier_id, COALESCE(SUM(total),0) as total FROM purchase_returns WHERE supplier_id IN (${ids.join(',')}) GROUP BY supplier_id`
    );
    const [openingSums] = await sequelize.query(
      `SELECT party_id, COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) as total FROM opening_balances WHERE party_type='supplier' AND party_id IN (${ids.join(',')}) GROUP BY party_id`
    );
    const [checkSums] = await sequelize.query(
      `SELECT party_id, COALESCE(SUM(amount),0) as total FROM checks WHERE party_type='supplier' AND status != 'bounced' AND party_id IN (${ids.join(',')}) GROUP BY party_id`
    );

    const invMap = {}, payMap = {}, retMap = {}, openMap = {}, checkMap = {};
    invoiceSums.forEach(r => { invMap[r.supplier_id] = Number(r.total); });
    paymentSums.forEach(r => { payMap[r.supplier_id] = Number(r.total); });
    returnSums.forEach(r => { retMap[r.supplier_id] = Number(r.total); });
    openingSums.forEach(r => { openMap[r.party_id] = Number(r.total); });
    checkSums.forEach(r => { checkMap[r.party_id] = Number(r.total); });

    res.json(suppliers.map(s => ({
      ...s.toJSON(),
      balance: Math.round(((invMap[s.id] || 0) - (payMap[s.id] || 0) - (retMap[s.id] || 0) - (checkMap[s.id] || 0) + (openMap[s.id] || 0)) * 100) / 100,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const s = await Supplier.findByPk(req.params.id);
    if (!s) return res.status(404).json({ error: 'غير موجود' });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Supplier.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const s = await Supplier.findByPk(req.params.id);
    if (!s) return res.status(404).json({ error: 'غير موجود' });
    await s.update(req.body);
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const s = await Supplier.findByPk(req.params.id);
    if (!s) return res.status(404).json({ error: 'غير موجود' });
    await s.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/statement', async (req, res) => {
  try {
    const invoices = await PurchaseInvoice.findAll({
      where: { supplier_id: req.params.id, status: 'posted' },
      include: [{ model: PurchaseInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'name', 'code'] }] }],
      order: [['date', 'ASC']],
    });
    const payments = await CashPayment.findAll({ where: { supplier_id: req.params.id }, order: [['date', 'ASC']] });
    const returns = await PurchaseReturn.findAll({
      where: { supplier_id: req.params.id },
      include: [{ model: PurchaseReturnItem, as: 'items', include: [{ model: Item, attributes: ['id', 'name', 'code'] }] }],
      order: [['date', 'ASC']],
    });
    const opening = await OpeningBalance.findAll({ where: { party_type: 'supplier', party_id: req.params.id } });
    const openingTotal = opening.reduce((sum, o) => sum + Number(o.credit || 0) - Number(o.debit || 0), 0);
    const checks = await Check.findAll({ where: { party_type: 'supplier', party_id: req.params.id }, order: [['date', 'ASC']] });
    const movements = [
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة شراء', reference: i.invoice_no, debit: 0, credit: Number(i.total), invoice_id: i.id, items: i.items, subtotal: Number(i.subtotal || 0), discount: Number(i.discount || 0), tax_rate: Number(i.tax_rate || 0), tax_amount: Number(i.tax_amount || 0) })),
      ...payments.map(p => ({ date: p.date, type: 'دفع', reference: p.payment_no, debit: Number(p.amount), credit: 0 })),
      ...returns.map(r => ({ date: r.date, type: 'مرتجع شراء', reference: r.return_no, debit: Number(r.total), credit: 0, items: r.items, subtotal: Number(r.total) - Number(r.tax_amount || 0), discount: 0, tax_rate: Number(r.tax_rate || 0), tax_amount: Number(r.tax_amount || 0) })),
      ...checks.map(c => ({ date: c.date, type: 'شيك', reference: c.check_no, debit: c.status === 'bounced' ? 0 : Number(c.amount), credit: 0, check_due_date: c.due_date, check_status: c.status })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = openingTotal;
    if (openingTotal) movements.unshift({ date: null, type: 'رصيد افتتاحي', reference: '-', debit: 0, credit: 0, balance: openingTotal, isOpening: true });
    movements.forEach(m => { if (!m.isOpening) { balance += m.credit - m.debit; m.balance = balance; } });
    res.json(movements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

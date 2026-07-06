const router = require('express').Router();
const { Supplier, PurchaseInvoice, CashPayment, sequelize } = require('../models');
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

    const invMap = {}, payMap = {};
    invoiceSums.forEach(r => { invMap[r.supplier_id] = Number(r.total); });
    paymentSums.forEach(r => { payMap[r.supplier_id] = Number(r.total); });

    res.json(suppliers.map(s => ({
      ...s.toJSON(),
      balance: (invMap[s.id] || 0) - (payMap[s.id] || 0),
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
    const invoices = await PurchaseInvoice.findAll({ where: { supplier_id: req.params.id, status: 'posted' }, order: [['date', 'ASC']] });
    const payments = await CashPayment.findAll({ where: { supplier_id: req.params.id }, order: [['date', 'ASC']] });
    const movements = [
      ...invoices.map(i => ({ date: i.date, type: 'فاتورة شراء', reference: i.invoice_no, debit: 0, credit: Number(i.total), invoice_id: i.id })),
      ...payments.map(p => ({ date: p.date, type: 'دفع', reference: p.payment_no, debit: Number(p.amount), credit: 0 })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = 0;
    movements.forEach(m => { balance += m.credit - m.debit; m.balance = balance; });
    res.json(movements);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

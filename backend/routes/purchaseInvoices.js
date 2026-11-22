const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const { PurchaseInvoice, PurchaseInvoiceItem, Supplier, Item, Stock, StockMovement, CashPayment, sequelize } = require('../models');
const { listInvoices } = require('../utils/invoiceList');
const { invoiceNumberError, approvalError } = require('../utils/invoiceRules');
const { closedYearError } = require('../utils/financialYear');
const { missingWarehouseError } = require('../utils/invoiceWarehouse');
const { clean } = require('../utils/clean');
const { computeInvoice } = require('../utils/invoiceMath');
const { nextNumber } = require('../utils/numbering');
const { lockStock, lockMany } = require('../utils/stockOps');
const { bump } = require('../utils/balances');
const { dateError } = require('../utils/dateGuard');
const { correctPostedInvoice } = require('../utils/postedCorrection');

// what the client may set on an invoice; its status, approval and every money total are the server's
const PROTECTED = ['status', 'approved_at', 'subtotal', 'tax_amount', 'total', 'remaining'];

router.get('/', async (req, res) => {
  try {
    res.json(await listInvoices(req, { Invoice: PurchaseInvoice, Party: Supplier, ItemModel: PurchaseInvoiceItem, partyKey: 'supplier_id' }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id, { include: [Supplier, { model: PurchaseInvoiceItem, as: 'items', include: [Item] }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    res.json(inv);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const data = clean(PurchaseInvoice, req.body, PROTECTED);
    const calc = computeInvoice(req.body.items, data);
    Object.assign(data, calc.header);
    const items = calc.lines;
    if (!data.supplier_id) { await t.rollback(); return res.status(400).json({ error: 'المورد مطلوب' }); }
    const badDate = dateError(data.date);
    if (badDate) { await t.rollback(); return res.status(400).json({ error: badDate }); }
    const closedErr = await closedYearError(data.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const numErr = await invoiceNumberError(data, t);
    if (numErr) { await t.rollback(); return res.status(400).json({ error: numErr }); }
    data.invoice_no = data.invoice_no || await nextNumber('PI', t);
    const inv = await PurchaseInvoice.create(data, { transaction: t });
    if (items?.length) await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id, { transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (inv.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'لا يمكن تعديل فاتورة مرحّلة' }); }
    const data = clean(PurchaseInvoice, req.body, PROTECTED);
    const sourceItems = Array.isArray(req.body.items) ? req.body.items : (await PurchaseInvoiceItem.findAll({ where: { invoice_id: inv.id }, transaction: t, raw: true }));
    const calc = computeInvoice(sourceItems, { discount: inv.discount, tax_rate: inv.tax_rate, paid: inv.paid, ...data });
    Object.assign(data, calc.header);
    const items = Array.isArray(req.body.items) ? calc.lines : undefined;
    const badDate = dateError(data.date);
    if (badDate) { await t.rollback(); return res.status(400).json({ error: badDate }); }
    const closedErr = await closedYearError(data.date || inv.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    data.approved_at = null; // an edited invoice has to be approved again
    if (items) {
      await PurchaseInvoiceItem.destroy({ where: { invoice_id: inv.id }, transaction: t });
      await PurchaseInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    }
    await inv.update(data, { transaction: t });
    await t.commit();
    res.json(await PurchaseInvoice.findByPk(inv.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// date and line prices of a POSTED invoice (needs the 'correct' permission: see middleware/auth.js)
router.post('/:id/correct', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await correctPostedInvoice('purchase', req.params.id, req.body, t);
    await t.commit();
    res.json(inv);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/:id/approve', async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'الاعتماد للمدير فقط' });
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    if (inv.status === 'posted') return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' });
    await inv.update({ approved_at: new Date() });
    res.json({ message: 'تم اعتماد الفاتورة' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/:id/post', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    // the invoice row is locked first: two postings of the same invoice cannot both go through
    const locked = await PurchaseInvoice.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!locked) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (locked.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' }); }
    const inv = await PurchaseInvoice.findByPk(req.params.id, { include: [{ model: PurchaseInvoiceItem, as: 'items' }], transaction: t });
    const closedErr = await closedYearError(inv.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const appErr = await approvalError(inv, t);
    if (appErr) { await t.rollback(); return res.status(400).json({ error: appErr }); }
    const whErr = await missingWarehouseError(inv, t);
    if (whErr) { await t.rollback(); return res.status(400).json({ error: whErr }); }

    await inv.update({ status: 'posted' }, { transaction: t });

    // Update supplier balance: add remaining (total - paid) to balance
    const remaining = Number(inv.total || 0) - Number(inv.paid || 0);
    await bump(Supplier, inv.supplier_id, remaining, t);

    // If paid > 0, create a cash payment record
    const paidAmt = Number(inv.paid || 0);
    if (paidAmt > 0) {
      await CashPayment.create({
        payment_no: await nextNumber('CP', t),
        date: inv.date,
        supplier_id: inv.supplier_id,
        amount: paidAmt,
        payment_method: 'نقدي',
        notes: `دفعة فاتورة شراء ${inv.invoice_no}`,
      }, { transaction: t });
    }

    // Increment stock for each item
    if (inv.warehouse_id) {
      await lockMany((inv.items || []).map(i => ({ item_id: i.item_id, warehouse_id: inv.warehouse_id })), t);
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        const wt = Number(item.weight || 0);
        if (qty <= 0 && wt <= 0) continue;
        const stock = await lockStock(item.item_id, inv.warehouse_id, t);
        await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });

        // Effective purchase price = item cost net of its own discount, plus its
        // proportional share of the invoice-level discount and tax, per unit weight.
        const unit = wt > 0 ? wt : qty;
        if (unit > 0) {
          const itemNet = Number(item.total || 0);
          // VAT is charged on the subtotal after discounts, so a line carries tax in proportion to its net share
          const taxShare = Number(inv.subtotal || 0) > 0 ? Number(inv.tax_amount || 0) * (itemNet / Number(inv.subtotal)) : 0;
          const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
          const effectivePrice = (itemNet - discShare + taxShare) / unit;
          if (effectivePrice > 0) await fullItem.update({ purchase_price: Math.round(effectivePrice * 100) / 100 }, { transaction: t });
        }
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: inv.warehouse_id,
          movement_type: 'فاتورة شراء', quantity: qty, weight: wt,
          unit_price: Number(item.price || 0), date: inv.date,
          description: `فاتورة شراء ${inv.invoice_no}`, reference: inv.invoice_no,
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ message: 'تم الترحيل' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await PurchaseInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    if (inv.status === 'posted') return res.status(400).json({ error: 'لا يمكن حذف فاتورة مرحّلة' });
    await inv.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    // a posted invoice has already moved stock and balances, so only drafts can be deleted
    const posted = await PurchaseInvoice.count({ where: { id: ids, status: 'posted' } });
    if (posted > 0) return res.status(400).json({ error: `لا يمكن حذف فواتير مرحّلة (${posted}) - المحدد يحتوي على فواتير مرحّلة` });
    await PurchaseInvoice.destroy({ where: { id: ids } });
    res.json({ message: `تم حذف ${ids.length} فاتورة` });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/supplier/:supplierId', async (req, res) => {
  try {
    res.json(await PurchaseInvoice.findAll({
      where: { supplier_id: req.params.supplierId },
      include: [{ model: PurchaseInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }],
    }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

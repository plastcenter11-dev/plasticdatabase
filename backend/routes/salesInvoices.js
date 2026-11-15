const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const { SalesInvoice, SalesInvoiceItem, Customer, Employee, Item, Stock, StockMovement, CashReceipt, sequelize } = require('../models');
const { listInvoices } = require('../utils/invoiceList');
const { closedYearError } = require('../utils/financialYear');
const { missingWarehouseError } = require('../utils/invoiceWarehouse');
const { invoiceNumberError, belowCostError, creditError, approvalError } = require('../utils/invoiceRules');
const { clean } = require('../utils/clean');
const { computeInvoice } = require('../utils/invoiceMath');
const { nextNumber } = require('../utils/numbering');
const { lockStock, lockMany } = require('../utils/stockOps');
const { bump } = require('../utils/balances');

// what the client may set on an invoice; its status, approval, document link and every money total are the server's
const PROTECTED = ['status', 'approved_at', 'delivery_note_id', 'subtotal', 'tax_amount', 'total', 'remaining'];

router.get('/', async (req, res) => {
  try {
    res.json(await listInvoices(req, { Invoice: SalesInvoice, Party: Customer, ItemModel: SalesInvoiceItem, partyKey: 'customer_id', extra: [{ model: Employee, attributes: ['id', 'name'] }] }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [Customer, Employee, { model: SalesInvoiceItem, as: 'items', include: [Item] }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    res.json(inv);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const data = clean(SalesInvoice, req.body, PROTECTED);
    const calc = computeInvoice(req.body.items, data);
    Object.assign(data, calc.header);
    const items = calc.lines;
    const closedErr = await closedYearError(data.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const ruleErr = await invoiceNumberError(data) || await belowCostError(items, t);
    if (ruleErr) { await t.rollback(); return res.status(400).json({ error: ruleErr }); }
    data.invoice_no = data.invoice_no || await nextNumber('SI', t);
    const inv = await SalesInvoice.create(data, { transaction: t });
    if (items?.length) await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { transaction: t });
    if (!inv) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (inv.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'لا يمكن تعديل فاتورة مرحّلة' }); }
    const data = clean(SalesInvoice, req.body, PROTECTED);
    // the money is worked out again from the lines (the new ones, or the saved ones when only the header changed)
    const sourceItems = Array.isArray(req.body.items) ? req.body.items : (await SalesInvoiceItem.findAll({ where: { invoice_id: inv.id }, transaction: t, raw: true }));
    const calc = computeInvoice(sourceItems, { discount: inv.discount, tax_rate: inv.tax_rate, paid: inv.paid, ...data });
    Object.assign(data, calc.header);
    const items = Array.isArray(req.body.items) ? calc.lines : undefined;
    const closedErr = await closedYearError(data.date || inv.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const ruleErr = await belowCostError(calc.lines, t);
    if (ruleErr) { await t.rollback(); return res.status(400).json({ error: ruleErr }); }
    data.approved_at = null; // an edited invoice has to be approved again
    if (items) {
      await SalesInvoiceItem.destroy({ where: { invoice_id: inv.id }, transaction: t });
      await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })), { transaction: t });
    }
    await inv.update(data, { transaction: t });
    await t.commit();
    res.json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/:id/approve', async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'الاعتماد للمدير فقط' });
    const inv = await SalesInvoice.findByPk(req.params.id);
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
    const locked = await SalesInvoice.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!locked) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (locked.status === 'posted') { await t.rollback(); return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' }); }
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [{ model: SalesInvoiceItem, as: 'items' }], transaction: t });
    const closedErr = await closedYearError(inv.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const ruleErr = await approvalError(inv) || await belowCostError(inv.items, t) || await creditError(inv, t);
    if (ruleErr) { await t.rollback(); return res.status(400).json({ error: ruleErr }); }
    const whErr = await missingWarehouseError(inv, t);
    if (whErr) { await t.rollback(); return res.status(400).json({ error: whErr }); }

    // Check stock availability before posting (the rows are locked, so a concurrent posting waits and
    // then sees the stock it left behind)
    if (inv.warehouse_id) {
      await lockMany((inv.items || []).map(i => ({ item_id: i.item_id, warehouse_id: inv.warehouse_id })), t);
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        const wt = Number(item.weight || 0);
        if (qty <= 0 && wt <= 0) continue;
        const stock = await Stock.findOne({ where: { item_id: item.item_id, warehouse_id: inv.warehouse_id }, transaction: t, lock: t.LOCK.UPDATE });
        if (wt > 0) {
          const availableWt = stock ? Number(stock.weight || 0) : 0;
          if (availableWt < wt) {
            await t.rollback();
            return res.status(400).json({ error: `الوزن المتاح من "${fullItem.name}" (${availableWt} كجم) أقل من الوزن المطلوب (${wt} كجم)` });
          }
        } else if (qty > 0) {
          const availableQty = stock ? Number(stock.quantity) : 0;
          if (availableQty < qty) {
            await t.rollback();
            return res.status(400).json({ error: `الكمية المتاحة من "${fullItem.name}" (${availableQty}) أقل من الكمية المطلوبة (${qty})` });
          }
        }
      }
    }

    await inv.update({ status: 'posted' }, { transaction: t });

    // Update customer balance by the unpaid remainder of the invoice
    if (inv.customer_id) {
      const remaining = Number(inv.remaining != null ? inv.remaining : Number(inv.total || 0) - Number(inv.paid || 0));
      await bump(Customer, inv.customer_id, remaining, t);

      // A payment entered on the invoice is recorded as a cash receipt, the same
      // way posting a purchase invoice records a cash payment. Without it the
      // amount stays a number on the invoice and never reaches the customer's
      // statement or balance. (The stored balance above already used the unpaid
      // remainder, so it is not touched again here.)
      const paidAmt = Number(inv.paid || 0);
      if (paidAmt > 0) {
        await CashReceipt.create({
          receipt_no: await nextNumber('CR', t),
          date: inv.date, customer_id: inv.customer_id, amount: paidAmt,
          payment_method: 'نقدي', notes: `دفعة فاتورة بيع ${inv.invoice_no}`,
        }, { transaction: t });
      }
    }

    // Decrement stock for each item
    if (inv.warehouse_id) {
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        const wt = Number(item.weight || 0);
        // A line can carry only a weight (no roll count); it still leaves the warehouse.
        if (qty <= 0 && wt <= 0) continue;
        const stock = await lockStock(item.item_id, inv.warehouse_id, t);
        await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });

        // Effective sale price = item revenue net of its own discount, plus its
        // proportional share of the invoice-level discount and tax, per unit weight.
        const unit = wt > 0 ? wt : qty;
        if (unit > 0) {
          const itemNet = Number(item.total || 0);
          // VAT is charged on the subtotal after discounts, so a line carries tax in proportion to its net share
          const taxShare = Number(inv.subtotal || 0) > 0 ? Number(inv.tax_amount || 0) * (itemNet / Number(inv.subtotal)) : 0;
          const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
          const effectivePrice = (itemNet - discShare + taxShare) / unit;
          if (effectivePrice > 0) await fullItem.update({ sale_price: Math.round(effectivePrice * 100) / 100 }, { transaction: t });
        }
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: inv.warehouse_id,
          movement_type: 'فاتورة بيع', quantity: qty, weight: wt,
          unit_price: Number(item.price || 0), date: inv.date,
          description: `فاتورة بيع ${inv.invoice_no}`, reference: inv.invoice_no,
        }, { transaction: t });
      }
    }

    await t.commit();
    res.json({ message: 'تم الترحيل' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
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
    const posted = await SalesInvoice.count({ where: { id: ids, status: 'posted' } });
    if (posted > 0) return res.status(400).json({ error: `لا يمكن حذف فواتير مرحّلة (${posted}) - المحدد يحتوي على فواتير مرحّلة` });
    await SalesInvoice.destroy({ where: { id: ids } });
    res.json({ message: `تم حذف ${ids.length} فاتورة` });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

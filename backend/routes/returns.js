const router = require('express').Router();
const { listBalances } = require('../utils/stockBalances');
const { describeError, errorStatus } = require('../utils/errors');
const { PurchaseReturn, PurchaseReturnItem, SalesReturn, SalesReturnItem, Supplier, Customer, Item, Stock, StockMovement, PurchaseInvoice, SalesInvoice, PurchaseInvoiceItem, SalesInvoiceItem, Warehouse, sequelize } = require('../models');
const { closedYearError } = require('../utils/financialYear');
const { overReturnError } = require('../utils/returnLimits');
const { clean, badRequest } = require('../utils/clean');
const { computeReturn } = require('../utils/returnMath');
const { nextNumber } = require('../utils/numbering');
const { lockStock } = require('../utils/stockOps');
const { bump, lockParty } = require('../utils/balances');

// The return record and its lines as they are saved: only the real columns are taken from the request, and
// the money (total, tax) is worked out here, from the invoice when the return names one.
async function prepareReturn(kind, body, t) {
  const sales = kind === 'sales';
  const Return = sales ? SalesReturn : PurchaseReturn;
  const Invoice = sales ? SalesInvoice : PurchaseInvoice;
  const InvoiceItem = sales ? SalesInvoiceItem : PurchaseInvoiceItem;
  const partyKey = sales ? 'customer_id' : 'supplier_id';
  const data = clean(Return, body, ['return_no', 'total', 'tax_amount']);
  let invoice = null, invoiceItems = [];
  if (data.invoice_id) {
    invoice = await Invoice.findByPk(data.invoice_id, { transaction: t });
    if (!invoice) throw badRequest('الفاتورة غير موجودة');
    if (invoice.status !== 'posted') throw badRequest('المرتجع لا يكون إلا من فاتورة مرحّلة');
    if (data[partyKey] && Number(data[partyKey]) !== Number(invoice[partyKey])) throw badRequest(sales ? 'الفاتورة دي مش بتاعة العميل ده' : 'الفاتورة دي مش بتاعة المورد ده');
    invoiceItems = await InvoiceItem.findAll({ where: { invoice_id: invoice.id }, transaction: t, raw: true });
  }
  const calc = computeReturn(body.items, { invoice, invoiceItems, tax_rate: data.tax_rate });
  Object.assign(data, calc.header);
  return { data, items: calc.lines };
}

// Purchase Returns
// balances for the warning before returning goods to a supplier (readable with the purchase permission)
router.get('/purchase/stock-balances', async (req, res) => {
  try { res.json(await listBalances()); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/purchase', async (req, res) => {
  try {
    res.json(await PurchaseReturn.findAll({ include: [Supplier, PurchaseInvoice, Warehouse, { model: PurchaseReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/purchase', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { data, items } = await prepareReturn('purchase', req.body, t);
    const closedErr = await closedYearError(data.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const overErr = await overReturnError('purchase', data.invoice_id, items, t);
    if (overErr) { await t.rollback(); return res.status(400).json({ error: overErr }); }
    data.return_no = await nextNumber('PR', t);
    await lockParty(Supplier, data.supplier_id, t);
    const ret = await PurchaseReturn.create(data, { transaction: t });
    if (items?.length) await PurchaseReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id })), { transaction: t });

    // Purchase return: stock leaves us (decrement), supplier owes us less (decrement balance)
    for (const item of (items || [])) {
      if (ret.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const stock = await lockStock(item.item_id, ret.warehouse_id, t);
          await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });
          await StockMovement.create({
            item_id: item.item_id, warehouse_id: ret.warehouse_id,
            movement_type: 'مرتجع شراء', quantity: qty, weight: wt,
            unit_price: Number(item.price || 0), date: ret.date,
            description: `مرتجع شراء ${ret.return_no}`, reference: ret.return_no,
          }, { transaction: t });
        }
      }
    }
    if (ret.supplier_id) {
      await bump(Supplier, ret.supplier_id, -Number(ret.total || 0), t);
    }

    await t.commit();
    res.status(201).json(await PurchaseReturn.findByPk(ret.id, { include: [{ model: PurchaseReturnItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/purchase/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const r = await PurchaseReturn.findByPk(req.params.id, { include: [{ model: PurchaseReturnItem, as: 'items' }], transaction: t });
    if (!r) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(r.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }

    // Reverse the return's stock/balance effects before deleting
    for (const item of (r.items || [])) {
      if (r.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const stock = await lockStock(item.item_id, r.warehouse_id, t);
          await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });
        }
      }
    }
    if (r.supplier_id) {
      await bump(Supplier, r.supplier_id, Number(r.total || 0), t);
    }

    await StockMovement.destroy({ where: { reference: r.return_no, movement_type: 'مرتجع شراء' }, transaction: t });
    await r.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Sales Returns
router.get('/sales', async (req, res) => {
  try {
    res.json(await SalesReturn.findAll({ include: [Customer, SalesInvoice, Warehouse, { model: SalesReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/sales', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { data, items } = await prepareReturn('sales', req.body, t);
    const closedErr = await closedYearError(data.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const overErr = await overReturnError('sales', data.invoice_id, items, t);
    if (overErr) { await t.rollback(); return res.status(400).json({ error: overErr }); }
    data.return_no = await nextNumber('SR', t);
    await lockParty(Customer, data.customer_id, t);
    const ret = await SalesReturn.create(data, { transaction: t });
    if (items?.length) await SalesReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id })), { transaction: t });

    // Sales return: stock comes back to us (increment), customer owes us less (decrement balance)
    for (const item of (items || [])) {
      if (ret.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const stock = await lockStock(item.item_id, ret.warehouse_id, t);
          await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });
          await StockMovement.create({
            item_id: item.item_id, warehouse_id: ret.warehouse_id,
            movement_type: 'مرتجع بيع', quantity: qty, weight: wt,
            unit_price: Number(item.price || 0), date: ret.date,
            description: `مرتجع بيع ${ret.return_no}`, reference: ret.return_no,
          }, { transaction: t });
        }
      }
    }
    if (ret.customer_id) {
      await bump(Customer, ret.customer_id, -Number(ret.total || 0), t);
    }

    await t.commit();
    res.status(201).json(await SalesReturn.findByPk(ret.id, { include: [{ model: SalesReturnItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/sales/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const r = await SalesReturn.findByPk(req.params.id, { include: [{ model: SalesReturnItem, as: 'items' }], transaction: t });
    if (!r) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(r.date, t);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }

    // Reverse the return's stock/balance effects before deleting
    for (const item of (r.items || [])) {
      if (r.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const stock = await lockStock(item.item_id, r.warehouse_id, t);
          await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });
        }
      }
    }
    if (r.customer_id) {
      await bump(Customer, r.customer_id, Number(r.total || 0), t);
    }

    await StockMovement.destroy({ where: { reference: r.return_no, movement_type: 'مرتجع بيع' }, transaction: t });
    await r.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

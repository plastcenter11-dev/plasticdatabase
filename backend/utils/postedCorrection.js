'use strict';

// Correcting a POSTED invoice: its date and the price of its lines, nothing else.
//
// A posted invoice is not just a row: posting moved the customer's / supplier's balance, wrote stock
// movements dated and priced from it, created the cash receipt / payment for what was paid, and set the
// item's last sale / purchase price. Unlocking the plain edit would change the invoice and leave all of that
// behind (balances that no longer add up). This does the whole correction in ONE transaction instead:
//
//   date   -> the invoice, its stock movements, the receipt / payment made with it and, for an invoice that
//             came from a delivery note, the note and the movements written under the note's number
//   prices -> line totals, subtotal, tax, total and remaining, the party's balance by the difference,
//             the movements' unit price and the item's last price (only when this invoice set it)
//
// Quantities, weights, warehouse, party and invoice number are never touched: those moved stock, and a wrong
// one is corrected with a return and a new invoice.

const { Op } = require('sequelize');
const models = require('../models');
const { closedYearError } = require('./financialYear');
const { computeInvoice, round2 } = require('./invoiceMath');
const { badRequest } = require('./clean');
const { dateError } = require('./dateGuard');
const { bump, lockParty } = require('./balances');
const { belowCostError } = require('./invoiceRules');

const { sequelize, SalesInvoice, SalesInvoiceItem, SalesReturn, Customer, CashReceipt, PurchaseInvoice, PurchaseInvoiceItem, PurchaseReturn, Supplier, CashPayment, Item, StockMovement, DeliveryNote } = models;

const KINDS = {
  sales: {
    Invoice: SalesInvoice, LineModel: SalesInvoiceItem, Return: SalesReturn, Party: Customer, partyKey: 'customer_id',
    Payment: CashReceipt, paymentPrefix: 'دفعة فاتورة بيع', movementType: 'فاتورة بيع', movementLabel: 'فاتورة بيع', priceField: 'sale_price',
    // what was added to the party's balance when the invoice was posted
    postedAmount: (inv) => Number(inv.remaining != null ? inv.remaining : Number(inv.total || 0) - Number(inv.paid || 0)),
  },
  purchase: {
    Invoice: PurchaseInvoice, LineModel: PurchaseInvoiceItem, Return: PurchaseReturn, Party: Supplier, partyKey: 'supplier_id',
    Payment: CashPayment, paymentPrefix: 'دفعة فاتورة شراء', movementType: 'فاتورة شراء', movementLabel: 'فاتورة شراء', priceField: 'purchase_price',
    postedAmount: (inv) => Number(inv.total || 0) - Number(inv.paid || 0),
  },
};

const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// the price the item was given when this invoice was posted (see the post routes): the line net of its
// discount plus its share of the invoice discount and tax, per unit weight (or count)
function effectivePrice(line, header) {
  const wt = Number(line.weight || 0);
  const unit = wt > 0 ? wt : Number(line.quantity || 0);
  if (!(unit > 0)) return 0;
  const itemNet = Number(line.total || 0);
  const sub = Number(header.subtotal || 0);
  const taxShare = sub > 0 ? Number(header.tax_amount || 0) * (itemNet / sub) : 0;
  const discShare = sub > 0 ? Number(header.discount || 0) * (itemNet / sub) : 0;
  return Math.round(((itemNet - discShare + taxShare) / unit) * 100) / 100;
}

async function correctPostedInvoice(kind, id, body, t) {
  const K = KINDS[kind];
  const inv = await K.Invoice.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!inv) throw Object.assign(new Error('غير موجود'), { status: 404 });
  if (inv.status !== 'posted') throw badRequest('الفاتورة مسودة — عدّلها بزر التعديل العادي');

  const req = body && typeof body === 'object' ? body : {};
  const oldDate = String(inv.date).slice(0, 10);
  const newDate = req.date ? String(req.date).slice(0, 10) : oldDate;
  const dErr = dateError(newDate);
  if (dErr) throw badRequest(dErr);
  const dateChanged = newDate !== oldDate;

  // the lines and their requested prices: only a line of this invoice, only its price
  const lines = await K.LineModel.findAll({ where: { invoice_id: inv.id }, order: [['id', 'ASC']], transaction: t });
  const byId = new Map(lines.map(l => [Number(l.id), l]));
  const newPrice = new Map();
  for (const p of (Array.isArray(req.items) ? req.items : [])) {
    const line = byId.get(Number(p.id));
    if (!line) throw badRequest('سطر غير موجود في هذه الفاتورة');
    if (p.price === undefined || p.price === null || p.price === '') continue;
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0) throw badRequest('السعر لازم يكون رقم لا يقل عن صفر');
    if (!sameMoney(price, line.price)) newPrice.set(Number(line.id), round2(price));
  }
  const priceChanged = newPrice.size > 0;
  if (!dateChanged && !priceChanged) throw badRequest('لا يوجد تغيير في التاريخ أو الأسعار');

  // a document in a closed / protected period is never touched, and nothing may be moved into one
  const closedOld = await closedYearError(oldDate, t);
  if (closedOld) throw badRequest(closedOld);
  if (dateChanged) {
    const closedNew = await closedYearError(newDate, t);
    if (closedNew) throw badRequest(closedNew);
  }

  const note = kind === 'sales' && inv.delivery_note_id ? await DeliveryNote.findByPk(inv.delivery_note_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
  // posting wrote its movements under the invoice number, or under the note's number for a delivery-note invoice
  const movementWhere = note
    ? { description: `إذن تسليم رقم ${note.note_no}`, reference: String(note.note_no) }
    : { description: `${K.movementLabel} ${inv.invoice_no}`, reference: inv.invoice_no };
  const baseMovement = { movement_type: K.movementType, ...movementWhere };

  if (priceChanged) {
    if (await K.Return.count({ where: { invoice_id: inv.id }, transaction: t })) {
      throw badRequest('عليها مرتجع محسوب على السعر الحالي — لا يمكن تغيير الأسعار. غيّر التاريخ فقط أو احذف المرتجع أولاً');
    }
    const asLines = lines.map(l => ({ item_id: l.item_id, quantity: l.quantity, weight: l.weight, discount: l.discount, price: newPrice.has(Number(l.id)) ? newPrice.get(Number(l.id)) : l.price }));
    // the discount, tax rate and paid amount stay as they were: only the lines are re-priced
    const calc = computeInvoice(asLines, { discount: inv.discount, tax_rate: inv.tax_rate, paid: inv.paid });
    if (kind === 'sales') {
      const ruleErr = await belowCostError(calc.lines, t);
      if (ruleErr) throw badRequest(ruleErr);
    }

    // the party's stored balance moves by what the invoice adds to it now, compared with what it added then
    const delta = round2(calc.header.remaining - K.postedAmount(inv));
    const partyId = inv[K.partyKey];
    if (partyId) { await lockParty(K.Party, partyId, t); await bump(K.Party, partyId, delta, t); }

    const oldHeader = { subtotal: inv.subtotal, discount: inv.discount, tax_amount: inv.tax_amount };
    const used = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nl = calc.lines[i];
      if (!newPrice.has(Number(line.id))) continue;
      const oldPrice = Number(line.price);
      const item = await Item.findByPk(line.item_id, { transaction: t, lock: t.LOCK.UPDATE });
      const oldEffective = effectivePrice(line, oldHeader);
      const newEffective = effectivePrice({ ...line.get(), total: nl.total }, calc.header);

      // the movement this line wrote when posted (the same item can be on two lines: match by price too)
      if (inv.warehouse_id && item?.is_stockable) {
        const mv = await StockMovement.findOne({
          where: { ...baseMovement, item_id: line.item_id, warehouse_id: inv.warehouse_id, unit_price: oldPrice, ...(used.length ? { id: { [Op.notIn]: used } } : {}) },
          transaction: t,
        });
        if (mv) { used.push(mv.id); await mv.update({ unit_price: nl.price }, { transaction: t }); }
      }

      // the item's last price, only if this invoice is the one that set it (a later invoice may have changed it since)
      if (item && !(kind === 'sales' && !note && !item.is_stockable)) {
        const current = Number(item[K.priceField] || 0);
        // a delivery-note invoice stores the plain price on the item; the others store the effective one
        const [wasPrice, nowPrice] = note ? [oldPrice, nl.price] : [oldEffective, newEffective];
        if (nowPrice > 0 && sameMoney(current, wasPrice)) await item.update({ [K.priceField]: nowPrice }, { transaction: t });
      }
      await line.update({ price: nl.price, total: nl.total }, { transaction: t });
    }
    await inv.update({ subtotal: calc.header.subtotal, tax_amount: calc.header.tax_amount, total: calc.header.total, remaining: calc.header.remaining }, { transaction: t });
  }

  if (dateChanged) {
    await inv.update({ date: newDate }, { transaction: t });
    await StockMovement.update({ date: newDate }, { where: baseMovement, transaction: t });
    // the payment made together with the invoice (same day, noted with its number) moves with it
    await K.Payment.update({ date: newDate }, { where: { notes: `${K.paymentPrefix} ${inv.invoice_no}`, [K.partyKey]: inv[K.partyKey], date: oldDate }, transaction: t });
    if (note) await note.update({ date: newDate }, { transaction: t });
  }

  return K.Invoice.findByPk(inv.id, { include: [{ model: K.LineModel, as: 'items' }], transaction: t });
}

module.exports = { correctPostedInvoice, effectivePrice };

'use strict';

// The one place an invoice's money is worked out. The screen shows a preview, but what is saved is what
// this computes from the lines: a client cannot send its own subtotal, tax, total or remaining.
//
//   line     = weight x price, less the line discount % (a line with no weight is measured by its count)
//   subtotal = sum of the lines
//   VAT      = (subtotal - header discount) x rate %        <- the taxable base, after both discounts
//   total    = subtotal - header discount + VAT
//   remaining = total - paid
// Every figure is kept to the piastre.

const { badRequest } = require('./clean');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

function computeInvoice(items, header = {}) {
  const lines = (items || []).map((i, n) => {
    const weight = num(i.weight), quantity = num(i.quantity), price = num(i.price), discount = num(i.discount);
    if (![weight, quantity, price, discount].every(Number.isFinite)) throw badRequest(`السطر ${n + 1}: قيمة غير صالحة`);
    if (weight < 0 || quantity < 0 || price < 0) throw badRequest(`السطر ${n + 1}: الوزن والعدد والسعر لا يمكن أن تكون سالبة`);
    if (discount < 0 || discount > 100) throw badRequest(`السطر ${n + 1}: الخصم لازم بين 0 و100`);
    const unit = weight > 0 ? weight : quantity;
    return { item_id: i.item_id, quantity, weight, price, discount, total: round2(unit * price * (1 - discount / 100)) };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discount = num(header.discount);
  const rate = header.tax_rate === undefined || header.tax_rate === null || header.tax_rate === '' ? 14 : Number(header.tax_rate);
  const paid = num(header.paid);
  if (![discount, rate, paid].every(Number.isFinite)) throw badRequest('قيمة غير صالحة في الخصم أو الضريبة أو المدفوع');
  if (discount < 0) throw badRequest('خصم الفاتورة لا يمكن أن يكون سالباً');
  if (discount > subtotal + 0.005) throw badRequest('خصم الفاتورة أكبر من إجمالي الأصناف');
  if (rate < 0 || rate > 100) throw badRequest('نسبة الضريبة لازم بين 0 و100');
  if (paid < 0) throw badRequest('المدفوع لا يمكن أن يكون سالباً');

  const tax_amount = round2(Math.max(0, subtotal - discount) * rate / 100);
  const total = round2(subtotal - discount + tax_amount);
  return { lines, header: { subtotal, discount: round2(discount), tax_rate: rate, tax_amount, total, paid: round2(paid), remaining: round2(total - paid) } };
}

module.exports = { computeInvoice, round2 };

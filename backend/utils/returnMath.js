'use strict';

// The money of a return, worked out by the server (the screen only previews it).
//
//  - A return linked to an invoice gives back exactly what that invoice charged for the goods: the line's
//    price after its own discount, plus the line's share of the invoice discount and of the invoice VAT
//    (VAT is shared by net amount, the same way posting the invoice shares it). The price comes from the
//    invoice, never from the request.
//  - A return with no invoice is priced from the lines the user typed, with the VAT rate typed, on the net.
// Every figure is kept to the piastre.

const { badRequest } = require('./clean');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

function checkLine(i, n) {
  const weight = num(i.weight), quantity = num(i.quantity), price = num(i.price), discount = num(i.discount);
  if (![weight, quantity, price, discount].every(Number.isFinite)) throw badRequest(`السطر ${n + 1}: قيمة غير صالحة`);
  if (weight < 0 || quantity < 0 || price < 0) throw badRequest(`السطر ${n + 1}: الوزن والعدد والسعر لا يمكن أن تكون سالبة`);
  if (discount < 0 || discount > 100) throw badRequest(`السطر ${n + 1}: الخصم لازم بين 0 و100`);
  return { weight, quantity, price, discount };
}

// what one unit of an invoice line cost the customer, split into the price after discounts and the VAT
function unitParts(line, invoice) {
  const weight = num(line.weight), quantity = num(line.quantity);
  const byWeight = weight > 0;
  const units = byWeight ? weight : quantity;
  if (units <= 0) return null;
  const net = num(line.total) || units * num(line.price) * (1 - num(line.discount) / 100);
  const subtotal = num(invoice.subtotal);
  const discShare = subtotal > 0 ? num(invoice.discount) * net / subtotal : 0;
  const taxShare = subtotal > 0 ? num(invoice.tax_amount) * net / subtotal : 0;
  return { byWeight, units, quantity, weight, price: num(line.price), discount: num(line.discount), exTax: (net - discShare) / units, tax: taxShare / units };
}

function computeReturn(items, { invoice = null, invoiceItems = [], tax_rate = 0 } = {}) {
  const lines = [];
  let total = 0, taxTotal = 0;

  (items || []).forEach((raw, n) => {
    const { weight, quantity, price, discount } = checkLine(raw, n);

    if (invoice) {
      const parts = invoiceItems.filter(l => Number(l.item_id) === Number(raw.item_id)).map(l => unitParts(l, invoice)).filter(Boolean);
      if (!parts.length) throw badRequest('الصنف غير موجود في الفاتورة المرتجع منها');
      const soldUnits = parts.reduce((s, p) => s + p.units, 0);
      const byWeight = parts[0].byWeight;
      // the average price per unit over the invoice lines of this item, weighted by how much each sold
      const exTax = parts.reduce((s, p) => s + p.exTax * p.units, 0) / soldUnits;
      const tax = parts.reduce((s, p) => s + p.tax * p.units, 0) / soldUnits;
      let units;
      if (byWeight) {
        const soldQty = parts.reduce((s, p) => s + p.quantity, 0);
        // only a roll count was given: the same share of the weight that was sold
        units = weight > 0 ? weight : (soldQty > 0 ? quantity / soldQty * soldUnits : 0);
      } else units = quantity;
      const lineTotal = round2((exTax + tax) * units);
      total += (exTax + tax) * units; taxTotal += tax * units;
      lines.push({ item_id: raw.item_id, quantity, weight, price: parts[0].price, discount: parts[0].discount, total: lineTotal });
    } else {
      const units = weight > 0 ? weight : quantity;
      const lineTotal = round2(units * price * (1 - discount / 100));
      total += lineTotal;
      lines.push({ item_id: raw.item_id, quantity, weight, price, discount, total: lineTotal });
    }
  });

  if (invoice) {
    return { lines, header: { tax_rate: num(invoice.tax_rate), tax_amount: round2(taxTotal), total: round2(total) } };
  }
  const rate = Number(tax_rate === '' || tax_rate === null || tax_rate === undefined ? 0 : tax_rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw badRequest('نسبة الضريبة لازم بين 0 و100');
  const subtotal = round2(total);
  const tax_amount = round2(subtotal * rate / 100);
  return { lines, header: { tax_rate: rate, tax_amount, total: round2(subtotal + tax_amount) } };
}

module.exports = { computeReturn };

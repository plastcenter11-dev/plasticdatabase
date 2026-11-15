// The totals of a sales / purchase invoice form. Prices are per kg, so every line is
// weight x price; a line discount is a percentage of that; the header discount is a fixed
// amount taken off the subtotal; VAT is charged on what is left after both discounts (the
// taxable base: a trade discount shown on the invoice lowers it). Every money figure is
// rounded to the piastre, never to the pound, so the invoice matches the VAT return.
//
// items: [{ weight, price, discount }]    header: { discount, tax_rate }

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const lineGross = (i) => (Number(i.weight) || 0) * (Number(i.price) || 0);
export const lineDiscount = (i) => lineGross(i) * (Number(i.discount || 0) / 100);
export const lineTotal = (i) => lineGross(i) - lineDiscount(i);

export function invoiceTotals(items, header = {}) {
  const gross = items.reduce((sum, i) => sum + lineGross(i), 0);
  // each line is kept to the piastre, as it is saved, and the subtotal is the sum of those lines
  const subtotal = round2(items.reduce((sum, i) => sum + round2(lineTotal(i)), 0));
  const discount = Number(header.discount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * (Number(header.tax_rate) || 0) / 100);
  return { gross, subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

// the party's balance after this invoice: the total, less what is paid now
export const expectedBalance = (balance, total, paid) => round2(Number(balance) + Number(total) - Number(paid || 0));

// The totals of a sales / purchase invoice form. Prices are per kg, so every line is
// weight x price; a line discount is a percentage of that; the header discount is a fixed
// amount taken off the subtotal; tax is a percentage of the gross (before line discounts).
//
// items: [{ weight, price, discount }]    header: { discount, tax_rate }

export const lineGross = (i) => (Number(i.weight) || 0) * (Number(i.price) || 0);
export const lineDiscount = (i) => lineGross(i) * (Number(i.discount || 0) / 100);
export const lineTotal = (i) => lineGross(i) - lineDiscount(i);

export function invoiceTotals(items, header = {}) {
  const gross = items.reduce((sum, i) => sum + lineGross(i), 0);
  const subtotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const discount = Number(header.discount || 0);
  const tax = gross * (Number(header.tax_rate) || 0) / 100;
  return { gross, subtotal, discount, tax, total: subtotal - discount + tax };
}

// the party's balance after this invoice: the total is rounded when saved, what is paid comes off
export const expectedBalance = (balance, total, paid) => Number(balance) + Math.round(total) - Number(paid || 0);

// Rep commission for one customer over a period, from that customer's statement rows
// (GET /customers/:id/statement). Every amount is on the billed basis (after discount, incl. VAT)
// so they can be added and subtracted together; VAT is removed only at the end, and only from
// the taxed share (see taxDivisorOf).

export const TAX_DIVISOR = 1.14;

// Cliché / cylinder lines are deducted from the customer's payments.
export const isPlate = (name) => /(كلاش|كلش|كليش|سلندر|سليندر)/.test(name || '');

// Kilograms sold on an invoice: a non-stock line (cliché, cylinder, any service) is billed but
// is not product sold, so its weight does not count. The item's own "non-stock" flag decides;
// only when the statement did not send the flag does the cliché name rule stand in.
export const isNonStockLine = (it) => (it.Item?.is_stockable === undefined ? isPlate(it.Item?.name) : !it.Item.is_stockable);
export const soldKg = (items) => (items || [])
  .filter(it => !isNonStockLine(it))
  .reduce((s, it) => s + Number(it.weight || 0), 0);

const sum = (list, k) => list.reduce((s, r) => s + Number(r[k] || 0), 0);

// A plate line's share of its invoice as billed: line / subtotal × invoice total.
export const platesOf = (invoice) => {
  const lines = (invoice.items || []).filter(it => isPlate(it.Item?.name)).reduce((a, it) => a + Number(it.total || 0), 0);
  if (!lines) return 0;
  const sub = Number(invoice.subtotal || 0);
  return sub > 0 ? lines / sub * Number(invoice.debit || 0) : lines * (1 + Number(invoice.tax_rate || 0) / 100);
};

// Payments are not linked to invoices, so VAT is removed using the customer's own invoices in the
// period: untaxed goods are not divided, taxed goods are divided by 1 + rate. The divisor is the
// weighted mix (billed ÷ ex-VAT) of the non-cliché part of those invoices. A customer with no
// invoices in the period falls back to 1.14 (flagged by `divisorGuessed`).
export const taxDivisorOf = (invoices) => {
  let billed = 0, exVat = 0;
  for (const inv of invoices) {
    const goods = Number(inv.debit || 0) - platesOf(inv);
    if (goods <= 0) continue;
    billed += goods;
    exVat += goods / (1 + Number(inv.tax_rate || 0) / 100);
  }
  return exVat > 0 ? { divisor: Math.round(billed / exVat * 1e6) / 1e6, guessed: false } : { divisor: TAX_DIVISOR, guessed: true };
};

export function repCommission(rows, ratePct) {
  const moves = rows.filter(r => !r.isOpening);
  const invoices = moves.filter(r => r.type === 'فاتورة بيع');
  const paid = sum(moves.filter(r => r.type === 'تحصيل' || r.type === 'شيك'), 'credit');
  const returns = sum(moves.filter(r => r.type === 'مرتجع بيع' || r.type === 'خصم نقدي'), 'credit');
  const bounced = sum(moves.filter(r => r.type === 'شيك مرتد'), 'debit');
  const plates = invoices.reduce((s, r) => s + platesOf(r), 0);
  const base = paid - bounced - returns - plates;
  const { divisor, guessed } = taxDivisorOf(invoices);
  const exTax = base / divisor;
  return { moves, invoices, paid, returns, bounced, plates, base, divisor, divisorGuessed: guessed, exTax, commission: exTax * Number(ratePct || 0) / 100 };
}

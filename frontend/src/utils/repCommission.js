// Rep commission for one customer over a period, from that customer's statement rows
// (GET /customers/:id/statement). Every amount is on the billed basis (after discount, incl. VAT)
// so they can be added and subtracted together; VAT is removed once, at the end.
//
// Prices here include VAT (14%) whether or not an invoice was saved with a tax rate, so the net is ALWAYS divided
// by 1.14 (owner's decision, 26/11/2026; an earlier version divided only the share of invoices carrying tax).

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

export function repCommission(rows, ratePct) {
  const moves = rows.filter(r => !r.isOpening);
  const invoices = moves.filter(r => r.type === 'فاتورة بيع');
  const paid = sum(moves.filter(r => r.type === 'تحصيل' || r.type === 'شيك'), 'credit');
  // cash paid back to the customer comes off the payments just like a cash discount does
  const returns = sum(moves.filter(r => r.type === 'مرتجع بيع' || r.type === 'خصم نقدي'), 'credit')
    + sum(moves.filter(r => r.type === 'رد نقدية'), 'debit');
  const bounced = sum(moves.filter(r => r.type === 'شيك مرتد'), 'debit');
  const plates = invoices.reduce((s, r) => s + platesOf(r), 0);
  const base = paid - bounced - returns - plates;
  const exTax = base / TAX_DIVISOR;
  return { moves, invoices, paid, returns, bounced, plates, base, divisor: TAX_DIVISOR, exTax, commission: exTax * Number(ratePct || 0) / 100 };
}

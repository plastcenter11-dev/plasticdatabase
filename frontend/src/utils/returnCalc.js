// Per-unit "effective" price for a returned line item, folding in that
// item's proportional share of the original invoice's header-level discount
// and tax - the same allocation the invoice's own POST /:id/post endpoint
// computes at posting time. Used so returning goods from a discounted/taxed
// invoice reverses exactly what the invoice actually charged for them, not
// the pre-discount line price - scaling by the returned quantity/weight
// handles partial returns correctly too.
//
// i: { weight, quantity, price, discount } - the ORIGINAL invoice line item
// inv: { tax_amount, discount, subtotal } - the invoice header
// grossTotal: no longer needed (tax is shared by net amount); kept so existing callers still work
export function effectiveUnitNet(i, inv, grossTotal) {
  const unit = Number(i.weight || 0) > 0 ? Number(i.weight) : Number(i.quantity) || 0;
  if (unit <= 0) return 0;
  const pr = Number(i.price) || 0;
  const disc = Number(i.discount) || 0;
  const itemNet = unit * pr * (1 - disc / 100);
  // VAT is charged on the subtotal after discounts, so a line carries tax in proportion to its net share
  const taxShare = Number(inv.subtotal || 0) > 0 ? Number(inv.tax_amount || 0) * (itemNet / Number(inv.subtotal)) : 0;
  const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
  return (itemNet - discShare + taxShare) / unit;
}

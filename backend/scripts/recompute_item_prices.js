require('dotenv').config();
const path = require('path');
const { sequelize, Item, PurchaseInvoice, PurchaseInvoiceItem, SalesInvoice, SalesInvoiceItem } = require(path.join(__dirname, '..', 'models'));

const apply = process.argv.includes('--apply');

function effectivePrice(item, inv) {
  const unit = Number(item.weight || 0) > 0 ? Number(item.weight) : Number(item.quantity || 0);
  if (unit <= 0) return null;
  // Recompute gross across all items on that invoice to allocate tax proportionally
  return { unit, itemGross: unit * Number(item.price || 0), itemNet: Number(item.total || 0) };
}

async function computeForInvoice(inv, items) {
  const grossTotal = items.reduce((s, it) => s + (Number(it.weight || 0) || Number(it.quantity || 0)) * Number(it.price || 0), 0);
  const results = {};
  for (const item of items) {
    const unit = Number(item.weight || 0) > 0 ? Number(item.weight) : Number(item.quantity || 0);
    if (unit <= 0) continue;
    const itemGross = unit * Number(item.price || 0);
    const itemNet = Number(item.total || 0);
    const taxShare = grossTotal > 0 ? Number(inv.tax_amount || 0) * (itemGross / grossTotal) : 0;
    const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
    const price = (itemNet - discShare + taxShare) / unit;
    results[item.item_id] = price;
  }
  return results;
}

(async () => {
  const items = await Item.findAll();
  const updates = [];

  for (const item of items) {
    // Latest posted purchase invoice line for this item
    const lastPurchase = await PurchaseInvoiceItem.findOne({
      where: { item_id: item.id },
      include: [{ model: PurchaseInvoice, where: { status: 'posted' }, required: true }],
      order: [[PurchaseInvoice, 'date', 'DESC'], [PurchaseInvoice, 'id', 'DESC']],
    });
    if (lastPurchase) {
      const inv = lastPurchase.PurchaseInvoice;
      const allItems = await PurchaseInvoiceItem.findAll({ where: { invoice_id: inv.id } });
      const priced = await computeForInvoice(inv, allItems);
      const newPrice = priced[item.id];
      if (newPrice > 0 && Math.abs(newPrice - Number(item.purchase_price)) > 0.005) {
        updates.push({ item, field: 'purchase_price', old: Number(item.purchase_price), new: Math.round(newPrice * 100) / 100, invoice_no: inv.invoice_no });
      }
    }

    // Latest posted sales invoice line for this item
    const lastSale = await SalesInvoiceItem.findOne({
      where: { item_id: item.id },
      include: [{ model: SalesInvoice, where: { status: 'posted' }, required: true }],
      order: [[SalesInvoice, 'date', 'DESC'], [SalesInvoice, 'id', 'DESC']],
    });
    if (lastSale) {
      const inv = lastSale.SalesInvoice;
      const allItems = await SalesInvoiceItem.findAll({ where: { invoice_id: inv.id } });
      const priced = await computeForInvoice(inv, allItems);
      const newPrice = priced[item.id];
      if (newPrice > 0 && Math.abs(newPrice - Number(item.sale_price)) > 0.005) {
        updates.push({ item, field: 'sale_price', old: Number(item.sale_price), new: Math.round(newPrice * 100) / 100, invoice_no: inv.invoice_no });
      }
    }
  }

  console.log(`${updates.length} update(s) ${apply ? '(APPLYING)' : '(dry run - pass --apply to write)'}:`);
  for (const u of updates) {
    console.log(`  ${u.item.code} ${u.item.name} : ${u.field} ${u.old} -> ${u.new} (from ${u.invoice_no})`);
    if (apply) await u.item.update({ [u.field]: u.new });
  }

  process.exit(0);
})();

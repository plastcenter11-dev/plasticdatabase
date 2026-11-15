// One-off repair for invoices created by posting a delivery note before the fix:
//   - their lines stored the total INCLUDING tax (every other invoice stores it before tax), and
//   - their header tax rate was the default 14 even when nothing was taxed.
// Sets each line total to weight (or count) x price after the line discount, and the invoice tax
// rate to the share of tax really charged. Invoice totals, balances and stock are not touched.
//
//   node scripts/repair_delivery_invoices.js          shows what would change
//   node scripts/repair_delivery_invoices.js --apply  changes it (take a backup first)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');
const r2 = (v) => Math.round(Number(v) * 100) / 100;

(async () => {
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASS, database: DB_NAME });
  const [invoices] = await conn.query('SELECT id, invoice_no, subtotal, tax_rate, tax_amount FROM sales_invoices WHERE delivery_note_id IS NOT NULL ORDER BY id');
  let changed = 0;
  for (const inv of invoices) {
    const [lines] = await conn.query('SELECT id, quantity, weight, price, discount, total FROM sales_invoice_items WHERE invoice_id = ?', [inv.id]);
    const updates = [];
    for (const l of lines) {
      const unit = Number(l.weight) > 0 ? Number(l.weight) : Number(l.quantity);
      const net = r2(unit * Number(l.price) * (1 - Number(l.discount || 0) / 100));
      if (Math.abs(net - Number(l.total)) > 0.005) updates.push({ id: l.id, from: Number(l.total), to: net });
    }
    const rate = Number(inv.subtotal) > 0 ? r2(Number(inv.tax_amount) / Number(inv.subtotal) * 100) : 0;
    const rateChanged = Math.abs(rate - Number(inv.tax_rate)) > 0.005;
    if (!updates.length && !rateChanged) continue;
    changed++;
    console.log(`${inv.invoice_no}: ${updates.map(u => `line ${u.from} -> ${u.to}`).join(', ') || 'lines ok'}${rateChanged ? `; tax rate ${Number(inv.tax_rate)} -> ${rate}` : ''}`);
    if (APPLY) {
      for (const u of updates) await conn.query('UPDATE sales_invoice_items SET total = ? WHERE id = ?', [u.to, u.id]);
      if (rateChanged) await conn.query('UPDATE sales_invoices SET tax_rate = ? WHERE id = ?', [rate, inv.id]);
    }
  }
  console.log(changed ? (APPLY ? `Repaired ${changed} invoice(s).` : `${changed} invoice(s) would change - run again with --apply.`) : 'Nothing to repair.');
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });

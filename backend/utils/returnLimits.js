'use strict';

// A return that names an invoice cannot give back more than that invoice sold (less what earlier
// returns of the same invoice already took back), and cannot contain an item the invoice never had.
// The weight is the measure; a line sold without a weight is measured by its roll count.

const { sequelize, Item } = require('../models');

const TABLES = {
  sales: { invoiceItems: 'sales_invoice_items', returns: 'sales_returns', returnItems: 'sales_return_items' },
  purchase: { invoiceItems: 'purchase_invoice_items', returns: 'purchase_returns', returnItems: 'purchase_return_items' },
};

async function overReturnError(kind, invoiceId, items, t) {
  if (!invoiceId) return null;
  const tb = TABLES[kind];
  const q = async (sql, replacements) => (await sequelize.query(sql, { replacements, transaction: t, type: sequelize.QueryTypes.SELECT }));

  const sold = await q(`SELECT item_id, COALESCE(SUM(weight),0) AS w, COALESCE(SUM(quantity),0) AS q FROM ${tb.invoiceItems} WHERE invoice_id = ? GROUP BY item_id`, [invoiceId]);
  const soldBy = new Map(sold.map(r => [Number(r.item_id), r]));
  const prior = await q(`SELECT ri.item_id, COALESCE(SUM(ri.weight),0) AS w, COALESCE(SUM(ri.quantity),0) AS q FROM ${tb.returnItems} ri JOIN ${tb.returns} r ON r.id = ri.return_id WHERE r.invoice_id = ? GROUP BY ri.item_id`, [invoiceId]);
  const priorBy = new Map(prior.map(r => [Number(r.item_id), r]));

  const asking = new Map(); // item_id -> { w, q }
  for (const i of items || []) {
    const e = asking.get(Number(i.item_id)) || { w: 0, q: 0 };
    e.w += Number(i.weight || 0); e.q += Number(i.quantity || 0);
    asking.set(Number(i.item_id), e);
  }

  for (const [itemId, want] of asking) {
    const name = (await Item.findByPk(itemId, { transaction: t }))?.name || itemId;
    const s = soldBy.get(itemId);
    if (!s) return `الصنف «${name}» غير موجود في الفاتورة المرتجع منها`;
    const p = priorBy.get(itemId) || { w: 0, q: 0 };
    const byWeight = Number(s.w) > 0;
    const left = byWeight ? Number(s.w) - Number(p.w) : Number(s.q) - Number(p.q);
    const asked = byWeight ? want.w : want.q;
    if (asked > left + 0.01) {
      return `الكمية المرتجعة من «${name}» (${asked}${byWeight ? ' كجم' : ''}) أكبر من المتبقي في الفاتورة (${Math.max(left, 0)}${byWeight ? ' كجم' : ''})`;
    }
  }
  return null;
}

module.exports = { overReturnError };

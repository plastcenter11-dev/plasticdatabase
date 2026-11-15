'use strict';

// Document numbers (SI-000123, CR-000045 ...) come from a counter row that is locked inside the document's
// own transaction. So two branches saving at the same moment get different numbers, a rolled-back
// document gives its number back, and deleting the last document never makes its number come back
// (the old "highest id + 1" did all three wrong). A counter starts above whatever the table already holds.

const { sequelize } = require('../models');

const SERIES = {
  SI: { table: 'sales_invoices', column: 'invoice_no', prefix: 'SI-', pad: 6 },
  PI: { table: 'purchase_invoices', column: 'invoice_no', prefix: 'PI-', pad: 6 },
  CR: { table: 'cash_receipts', column: 'receipt_no', prefix: 'CR-', pad: 6 },
  CP: { table: 'cash_payments', column: 'payment_no', prefix: 'CP-', pad: 6 },
  SR: { table: 'sales_returns', column: 'return_no', prefix: 'SR-', pad: 6 },
  PR: { table: 'purchase_returns', column: 'return_no', prefix: 'PR-', pad: 6 },
  DN: { table: 'delivery_notes', column: 'note_no', plain: true },
};

async function seedFor(s, t) {
  const [[row]] = await sequelize.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${s.table}`, { transaction: t });
  let seed = Number(row.m) || 0;
  if (s.plain) {
    const [[n]] = await sequelize.query(`SELECT COALESCE(MAX(CAST(${s.column} AS UNSIGNED)), 0) AS m FROM ${s.table}`, { transaction: t });
    return Math.max(seed, Number(n.m) || 0);
  }
  const [[n]] = await sequelize.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(${s.column}, ?) AS UNSIGNED)), 0) AS m FROM ${s.table} WHERE ${s.column} REGEXP ?`,
    { replacements: [s.prefix.length + 1, `^${s.prefix}[0-9]+$`], transaction: t });
  return Math.max(seed, Number(n.m) || 0);
}

// the next number of a series: a string like 'SI-000124' (an integer for the delivery notes). Needs the
// document's transaction so the counter and the document commit, or roll back, together.
async function nextNumber(series, t) {
  const s = SERIES[series];
  if (!s) throw new Error(`unknown number series ${series}`);
  if (!t) throw new Error('nextNumber needs the transaction of the document being saved');

  const read = async () => (await sequelize.query('SELECT `value` FROM counters WHERE name = ? FOR UPDATE', { replacements: [series], transaction: t }))[0];
  let rows = await read();
  if (!rows.length) {
    const seed = await seedFor(s, t);
    await sequelize.query('INSERT IGNORE INTO counters (name, `value`, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', { replacements: [series, seed], transaction: t });
    rows = await read();
  }
  const next = Number(rows[0].value) + 1;
  await sequelize.query('UPDATE counters SET `value` = ?, updated_at = NOW() WHERE name = ?', { replacements: [next, series], transaction: t });
  return s.plain ? next : `${s.prefix}${String(next).padStart(s.pad, '0')}`;
}

module.exports = { nextNumber, SERIES };

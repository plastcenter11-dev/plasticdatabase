const { sequelize } = require('../../models');

// Safety net: refuse to run against anything that isn't clearly the test DB.
function assertTestDb() {
  const name = sequelize.config.database;
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to operate on database "${name}" — it does not look like a test database.`);
  }
}

async function syncDb() {
  assertTestDb();
  await sequelize.sync({ force: true });
}

const TABLES = [
  'delivery_note_orders', 'delivery_note_items', 'delivery_notes',
  'sales_order_items', 'sales_orders',
  'sales_invoice_items', 'sales_invoices',
  'purchase_invoice_items', 'purchase_invoices',
  'sales_return_items', 'sales_returns',
  'purchase_return_items', 'purchase_returns',
  'cash_receipts', 'cash_payments', 'checks', 'expenses', 'other_incomes',
  'stock_movements', 'stocks',
  'warehouse_transfer_items', 'warehouse_transfers',
  'item_assembly_components', 'item_assemblies',
  'opening_balances',
  'items', 'customers', 'suppliers', 'employees', 'warehouses',
  'categories', 'item_types', 'financial_years', 'settings', 'users',
];

async function truncateAll() {
  assertTestDb();
  await sequelize.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of TABLES) {
    await sequelize.query(`TRUNCATE TABLE ${t}`).catch(() => {});
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS=1');
}

module.exports = { sequelize, syncDb, truncateAll, assertTestDb };

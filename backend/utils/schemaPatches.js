// sequelize.sync() creates missing tables but never adds columns to tables that
// already exist, so columns added to a model after the database was first created
// are added here at startup. Each patch is idempotent, so a fresh database, a
// restored backup and the live database all end up with the same columns.
const { DataTypes } = require('sequelize');

const PATCHES = [
  // "Extra expenses" lines on item assemblies (quantity x price added to cost).
  { table: 'item_assembly_components', column: 'is_expense', definition: { type: DataTypes.BOOLEAN, defaultValue: false } },
  { table: 'item_assembly_components', column: 'price', definition: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 } },
  // Invoice approval (settings option: an admin approves before posting).
  { table: 'sales_invoices', column: 'approved_at', definition: { type: DataTypes.DATE, allowNull: true } },
  { table: 'purchase_invoices', column: 'approved_at', definition: { type: DataTypes.DATE, allowNull: true } },
  // Sales representative name on the customer.
  { table: 'customers', column: 'sales_rep', definition: { type: DataTypes.STRING(100), allowNull: true } },
  // Cash payments can also be made back to a customer (a refund), not only to a supplier.
  { table: 'cash_payments', column: 'customer_id', definition: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'customers', key: 'id' } } },
  // Sessions signed in before the last password change stop working.
  { table: 'users', column: 'password_changed_at', definition: { type: DataTypes.DATE, allowNull: true } },
];

// Indexes added after the table existed. A unique one is only added when the data already satisfies it.
const INDEX_PATCHES = [
  { table: 'stocks', name: 'uq_stock_item_warehouse', columns: ['item_id', 'warehouse_id'], unique: true },
];

async function applySchemaPatches(sequelize) {
  const qi = sequelize.getQueryInterface();
  const added = [];
  for (const { table, column, definition } of PATCHES) {
    const existing = await qi.describeTable(table);
    if (!existing[column]) {
      await qi.addColumn(table, column, definition);
      added.push(`${table}.${column}`);
    }
  }
  for (const { table, name, columns, unique } of INDEX_PATCHES) {
    const [have] = await sequelize.query('SHOW INDEX FROM `' + table + '` WHERE Key_name = ?', { replacements: [name] });
    if (have.length) continue;
    if (unique) {
      const [dups] = await sequelize.query('SELECT 1 FROM `' + table + '` GROUP BY ' + columns.join(', ') + ' HAVING COUNT(*) > 1 LIMIT 1');
      if (dups.length) { console.warn('Index ' + name + ' NOT added: ' + table + ' already has duplicate rows'); continue; }
    }
    await sequelize.query('ALTER TABLE `' + table + '` ADD ' + (unique ? 'UNIQUE ' : '') + 'INDEX `' + name + '` (' + columns.join(', ') + ')');
    added.push(table + ' index ' + name);
  }
  return added;
}

module.exports = { applySchemaPatches };

// sequelize.sync() creates missing tables but never adds columns to tables that
// already exist, so columns added to a model after the database was first created
// are added here at startup. Each patch is idempotent, so a fresh database, a
// restored backup and the live database all end up with the same columns.
const { DataTypes } = require('sequelize');

const PATCHES = [
  // "Extra expenses" lines on item assemblies (quantity x price added to cost).
  { table: 'item_assembly_components', column: 'is_expense', definition: { type: DataTypes.BOOLEAN, defaultValue: false } },
  { table: 'item_assembly_components', column: 'price', definition: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 } },
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
  return added;
}

module.exports = { applySchemaPatches };

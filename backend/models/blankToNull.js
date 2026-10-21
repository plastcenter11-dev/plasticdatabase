'use strict';

// A form sends '' for an input the user left empty (an unpicked dropdown, an empty
// number or date box). MySQL rejects '' for a numeric, id or date column
// ("Incorrect integer value: '' for column 'category_id'"), so every endpoint that
// passes its body to a model would answer 500 for a field that is simply "not set".
// This registers global hooks that turn '' into "not set" for those column types,
// once, for every model and every write path (create, update, bulk create, bulk
// update). "Not set" is the column's own default when it has a plain one (a price
// left blank becomes 0), otherwise null. A required column that receives '' then
// fails validation as "cannot be null" instead of a database error.
//
// Text columns are untouched: '' is a legitimate value there.

const { DataTypes } = require('sequelize');

const BLANKABLE = [DataTypes.INTEGER, DataTypes.BIGINT, DataTypes.DECIMAL, DataTypes.FLOAT, DataTypes.DOUBLE, DataTypes.DATE, DataTypes.DATEONLY];
const isBlankable = (type) => BLANKABLE.some(T => type instanceof T);

const plainDefault = (attr) => (typeof attr.defaultValue === 'number' || typeof attr.defaultValue === 'string' ? attr.defaultValue : null);

// [column name, value meaning "not set"] for every blankable column of a model
const cache = new WeakMap();
function blankableColumns(Model) {
  if (!cache.has(Model)) {
    const attrs = Model.rawAttributes;
    cache.set(Model, Object.keys(attrs).filter(name => isBlankable(attrs[name].type)).map(name => [name, plainDefault(attrs[name])]));
  }
  return cache.get(Model);
}

function normalizeInstance(instance) {
  for (const [name, notSet] of blankableColumns(instance.constructor)) {
    if (instance.dataValues[name] === '') instance.setDataValue(name, notSet);
  }
}

function normalizeValues(Model, values) {
  if (!Model || !values) return;
  for (const [name, notSet] of blankableColumns(Model)) {
    if (values[name] === '') values[name] = notSet;
  }
}

function registerBlankToNull(sequelize) {
  sequelize.addHook('beforeValidate', (instance) => normalizeInstance(instance));
  // bulkCreate skips validation by default, so its instances are normalized here
  sequelize.addHook('beforeBulkCreate', (instances) => instances.forEach(normalizeInstance));
  // Model.update(values, { where }) bypasses instances altogether
  sequelize.addHook('beforeBulkUpdate', (options) => normalizeValues(options.model, options.attributes));
}

module.exports = { registerBlankToNull, normalizeValues };

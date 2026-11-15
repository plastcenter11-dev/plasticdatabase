'use strict';

// Stock rows are changed by many users at once (every branch posts invoices all day). Reading a balance,
// computing the new one in the program and writing it back lets two postings overwrite each other, or
// sell the same kilos twice. So a stock row is always LOCKED (SELECT ... FOR UPDATE) inside the
// document's transaction before it is read: the second posting waits for the first and then sees its result.

const { Op } = require('sequelize');
const { Stock } = require('../models');

// the (item, warehouse) row, locked until the surrounding transaction ends; created at zero if it is new
async function lockStock(itemId, warehouseId, t) {
  const where = { item_id: itemId, warehouse_id: warehouseId };
  let row = await Stock.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (row) return row;
  try {
    return await Stock.create({ ...where, quantity: 0, weight: 0 }, { transaction: t });
  } catch (err) {
    // somebody else created it a moment ago: take theirs
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    row = await Stock.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw err;
    return row;
  }
}

// Locks every row a document is about to touch, always in the same order (warehouse, then item). Two
// documents that need the same rows in a different order would otherwise wait for each other forever.
async function lockMany(pairs, t) {
  const wanted = [...new Map((pairs || [])
    .filter(p => p && p.item_id && p.warehouse_id)
    .map(p => [`${p.warehouse_id}|${p.item_id}`, { item_id: Number(p.item_id), warehouse_id: Number(p.warehouse_id) }])).values()];
  if (!wanted.length) return [];
  return Stock.findAll({
    where: { [Op.or]: wanted },
    order: [['warehouse_id', 'ASC'], ['item_id', 'ASC']],
    transaction: t, lock: t.LOCK.UPDATE,
  });
}

module.exports = { lockStock, lockMany };

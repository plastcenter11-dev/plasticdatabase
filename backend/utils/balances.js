'use strict';

// A customer's or supplier's stored balance is changed in the database itself (balance = balance + x), not
// by reading it, adding in the program and writing it back: two receipts for the same customer saved at
// the same moment must both count.

async function bump(Model, id, delta, t) {
  const amount = Number(delta);
  if (!id || !Number.isFinite(amount) || amount === 0) return;
  await Model.increment({ balance: amount }, { where: { id }, transaction: t });
}

// Taken BEFORE a document naming the party is inserted: the insert's foreign-key check holds a shared lock on
// the party row, and two documents doing that and then raising the balance wait on each other (a deadlock).
// With the row locked first they simply queue up.
async function lockParty(Model, id, t) {
  if (!id) return;
  await Model.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE, attributes: ['id'] });
}

module.exports = { bump, lockParty };

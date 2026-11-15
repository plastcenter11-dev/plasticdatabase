'use strict';

// A customer's or supplier's stored balance is changed in the database itself (balance = balance + x), not
// by reading it, adding in the program and writing it back: two receipts for the same customer saved at
// the same moment must both count.

async function bump(Model, id, delta, t) {
  const amount = Number(delta);
  if (!id || !Number.isFinite(amount) || amount === 0) return;
  await Model.increment({ balance: amount }, { where: { id }, transaction: t });
}

module.exports = { bump };

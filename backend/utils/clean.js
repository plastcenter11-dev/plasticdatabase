'use strict';

// What a request body may set on a record. `Model.create(req.body)` would let any client write any column
// (a status, a balance, the id itself), so every route takes only the model's real columns, minus the
// ones that belong to the server (ids, timestamps and whatever the route lists as protected).

const ALWAYS_PROTECTED = ['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at'];

function clean(Model, body, protectedKeys = []) {
  const allowed = new Set(Object.keys(Model.rawAttributes));
  for (const k of [...ALWAYS_PROTECTED, ...protectedKeys]) allowed.delete(k);
  return Object.fromEntries(Object.entries(body && typeof body === 'object' ? body : {}).filter(([k]) => allowed.has(k)));
}

// an error the caller caused (a 400 with a message the user can read)
function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

module.exports = { clean, badRequest };

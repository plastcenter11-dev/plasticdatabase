'use strict';

// Audit trail: who created, changed or deleted what, and when.
//
// The signed-in user is carried through each request with AsyncLocalStorage (set by the auth
// middleware), and global Sequelize hooks write one AuditLog row for every create / update /
// delete a request performs - in the same transaction as the change itself, so a rolled-back
// change leaves no log and a logged change always happened. Code that runs outside a request
// (scripts, tests, the startup seed) has no user and is not logged.
//
// Not logged: the audit table itself, and Stock / StockMovement, which are derived from the
// documents that are logged (a manual stock adjustment is still visible through its request).

const { AsyncLocalStorage } = require('node:async_hooks');
const util = require('node:util');

const als = new AsyncLocalStorage();

const IGNORED_MODELS = new Set(['AuditLog', 'Stock', 'StockMovement']);
const SECRET_FIELDS = new Set(['password']);
const SKIP_FIELDS = new Set(['createdAt', 'updatedAt', 'created_at', 'updated_at']);
const MAX_TEXT = 300;
const MAX_ROWS = 50;

// Fields that the system recomputes while posting documents. An update that touches only these
// is not a user edit, unless the request is a direct edit of that very record.
const DERIVED = {
  Customer: { fields: ['balance'], path: /^\/api\/customers/ },
  Supplier: { fields: ['balance'], path: /^\/api\/suppliers/ },
  Item: { fields: ['purchase_price', 'sale_price'], path: /^\/api\/items/ },
};

const runWithUser = (ctx, fn) => als.run(ctx, fn);
const currentContext = () => als.getStore() || null;

// the document / person identifying text shown in the log list
function labelOf(instance) {
  const v = instance.get ? instance.get() : instance;
  const first = ['invoice_no', 'order_no', 'return_no', 'receipt_no', 'payment_no', 'check_no', 'note_no', 'username', 'name', 'code', 'description', 'key']
    .find(k => v[k] !== undefined && v[k] !== null && String(v[k]) !== '');
  const text = first ? String(v[first]) : '';
  if (first === 'code' && v.name) return `${v.code} - ${v.name}`;
  return text.slice(0, 200);
}

function clean(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) + '…' : value;
  if (value && typeof value === 'object') { try { const s = JSON.stringify(value); return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : value; } catch { return String(value); } }
  return value;
}

// plain column values of a record, without secrets or timestamps
function snapshot(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (SKIP_FIELDS.has(k)) continue;
    out[k] = SECRET_FIELDS.has(k) ? '(مخفي)' : clean(v);
  }
  return out;
}

async function record(entry, transaction) {
  // required lazily: models/index.js registers these hooks, so it cannot be required at load time
  const { AuditLog } = require('../models');
  const ctx = currentContext();
  await AuditLog.create({
    user_id: entry.user_id ?? ctx?.user?.id ?? null,
    username: entry.username ?? ctx?.user?.username ?? '',
    action: entry.action,
    entity: entry.entity || '',
    entity_id: entry.entity_id ?? null,
    label: entry.label || '',
    changes: entry.changes === undefined ? null : JSON.stringify(entry.changes),
    ip: entry.ip ?? ctx?.ip ?? '',
  }, { transaction });
}

// a failure to log must never break the business operation it describes
const safely = (fn) => async (...args) => {
  try { await fn(...args); } catch (err) { console.error('audit log failed:', err.message); }
};

const active = (model) => currentContext()?.user && model && !IGNORED_MODELS.has(model.name);

function registerAudit(sequelize) {
  sequelize.addHook('afterCreate', safely(async (instance, options) => {
    const model = instance.constructor;
    if (!active(model)) return;
    await record({ action: 'create', entity: model.name, entity_id: instance.id, label: labelOf(instance), changes: snapshot(instance.get()) }, options.transaction);
  }));

  sequelize.addHook('afterUpdate', safely(async (instance, options) => {
    const model = instance.constructor;
    if (!active(model)) return;
    const changed = (instance.changed() || []).filter(k => !SKIP_FIELDS.has(k));
    if (!changed.length) return;
    const derived = DERIVED[model.name];
    if (derived && changed.every(k => derived.fields.includes(k)) && !derived.path.test(currentContext().path || '')) return;
    const changes = {};
    for (const k of changed) {
      changes[k] = SECRET_FIELDS.has(k) ? { from: '(مخفي)', to: '(مخفي)' } : { from: clean(instance.previous(k)), to: clean(instance.get(k)) };
    }
    await record({ action: 'update', entity: model.name, entity_id: instance.id, label: labelOf(instance), changes }, options.transaction);
  }));

  sequelize.addHook('afterDestroy', safely(async (instance, options) => {
    const model = instance.constructor;
    if (!active(model)) return;
    await record({ action: 'delete', entity: model.name, entity_id: instance.id, label: labelOf(instance), changes: snapshot(instance.get()) }, options.transaction);
  }));

  // bulk writes (document lines, "delete selected"): one row for the whole call
  sequelize.addHook('afterBulkCreate', safely(async (instances, options) => {
    const model = instances[0]?.constructor;
    if (!active(model)) return;
    const rows = instances.slice(0, MAX_ROWS).map(i => snapshot(i.get()));
    await record({ action: 'create', entity: model.name, label: `${instances.length} سطر`, changes: { rows, ...(instances.length > MAX_ROWS ? { more: instances.length - MAX_ROWS } : {}) } }, options.transaction);
  }));

  sequelize.addHook('afterBulkDestroy', safely(async (options) => {
    if (!active(options.model)) return;
    await record({ action: 'delete', entity: options.model.name, label: 'حذف جماعي', changes: { where: util.inspect(options.where, { depth: 3, breakLength: Infinity }).slice(0, 500) } }, options.transaction);
  }));

  sequelize.addHook('afterBulkUpdate', safely(async (options) => {
    if (!active(options.model)) return;
    const derived = DERIVED[options.model.name];
    const keys = Object.keys(options.attributes || {}).filter(k => !SKIP_FIELDS.has(k));
    if (derived && keys.length && keys.every(k => derived.fields.includes(k)) && !derived.path.test(currentContext().path || '')) return;
    await record({ action: 'update', entity: options.model.name, label: 'تعديل جماعي', changes: { set: snapshot(options.attributes || {}), where: util.inspect(options.where, { depth: 3, breakLength: Infinity }).slice(0, 500) } }, options.transaction);
  }));
}

module.exports = { registerAudit, runWithUser, currentContext, record };

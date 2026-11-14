const router = require('express').Router();
const { Op } = require('sequelize');
const { describeError, errorStatus } = require('../utils/errors');
const models = require('../models');
const { AuditLog, sequelize } = models;

// a log row stores ids (customer_id: 4); the page shows the name, looked up when it is read
const REF_FIELDS = {
  customer_id: 'Customer', supplier_id: 'Supplier', item_id: 'Item', assembled_item_id: 'Item', employee_id: 'Employee',
  warehouse_id: 'Warehouse', from_warehouse_id: 'Warehouse', to_warehouse_id: 'Warehouse',
};

async function refsFor(logs) {
  const wanted = {}; // field -> Set of ids
  const want = (field, id) => { if (REF_FIELDS[field] && id !== null && id !== undefined && id !== '') (wanted[field] = wanted[field] || new Set()).add(Number(id)); };
  for (const r of logs) {
    const c = r.changes;
    if (!c || typeof c !== 'object') continue;
    const scan = (obj) => { for (const [k, v] of Object.entries(obj || {})) { if (v && typeof v === 'object' && 'to' in v) { want(k, v.from); want(k, v.to); } else want(k, v); } };
    if (Array.isArray(c.rows)) c.rows.forEach(scan); else scan(c);
  }
  const byModel = {};
  for (const [field, ids] of Object.entries(wanted)) {
    const set = byModel[REF_FIELDS[field]] = byModel[REF_FIELDS[field]] || new Set();
    ids.forEach(id => set.add(id));
  }
  const names = {};
  for (const [modelName, ids] of Object.entries(byModel)) {
    const found = await models[modelName].findAll({ where: { id: [...ids] }, attributes: ['id', 'name'], raw: true });
    names[modelName] = Object.fromEntries(found.map(f => [f.id, f.name]));
  }
  const refs = {};
  for (const field of Object.keys(wanted)) refs[field] = names[REF_FIELDS[field]] || {};
  return refs;
}

// Read-only: the audit trail can be listed, never edited or deleted through the API.
// Mounted admin-only in app.js.

const parse = (text) => { try { return text ? JSON.parse(text) : null; } catch { return text; } };

// GET /api/audit-logs?from=&to=&username=&action=&entity=&q=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const { from, to, username, action, entity, q } = req.query;
    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(`${from}T00:00:00`);
      if (to) where.created_at[Op.lte] = new Date(`${to}T23:59:59.999`);
    }
    if (username) where.username = username;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (q) where.label = { [Op.like]: `%${String(q).replace(/[%_]/g, m => `\\${m}`)}%` };

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { count, rows } = await AuditLog.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset });
    const out = rows.map(r => ({ ...r.get(), changes: parse(r.changes) }));
    res.json({ total: count, rows: out, refs: await refsFor(out) });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// the values the filter dropdowns offer: every user and record type that appears in the log
router.get('/filters', async (req, res) => {
  try {
    const distinct = async (col) => (await AuditLog.findAll({ attributes: [[sequelize.fn('DISTINCT', sequelize.col(col)), col]], raw: true })).map(r => r[col]).filter(Boolean).sort();
    res.json({ usernames: await distinct('username'), entities: await distinct('entity') });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

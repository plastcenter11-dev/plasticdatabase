// The audit trail: who created / changed / deleted what, through the real app.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../app');
const { sequelize, User, AuditLog, Customer } = require('../../models');
const { runWithUser } = require('../../utils/audit');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeCustomer, makeItem } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
const as = (user) => ({ Authorization: `Bearer ${jwt.sign({ id: user.id, role: user.role }, SECRET)}` });

let admin, clerk;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  admin = await User.create({ username: 'boss', password: await bcrypt.hash('pw-boss-1', 10), role: 'admin' });
  clerk = await User.create({ username: 'clerk', password: await bcrypt.hash('pw-clerk-1', 10), role: 'user', permissions: { customers: ['view', 'create', 'edit', 'delete'] } });
});

const logsOf = (where) => AuditLog.findAll({ where, order: [['id', 'ASC']] });

describe('what a request changes is logged against the signed-in user', () => {
  test('a create is logged with the user, the record and its values', async () => {
    const res = await request(app).post('/api/customers').set(as(clerk)).send({ name: 'عميل السجل', phone: '0100' });
    expect(res.status).toBe(201);
    const [row] = await logsOf({ entity: 'Customer', action: 'create' });
    expect(row.username).toBe('clerk');
    expect(row.user_id).toBe(clerk.id);
    expect(row.entity_id).toBe(res.body.id);
    expect(row.label).toBe('عميل السجل');
    expect(JSON.parse(row.changes).phone).toBe('0100');
  });

  test('an update logs only the fields that changed, with the old and new value', async () => {
    const c = await makeCustomer({ name: 'قبل', phone: '1' });
    await request(app).put(`/api/customers/${c.id}`).set(as(clerk)).send({ name: 'بعد', phone: '1' });
    const [row] = await logsOf({ entity: 'Customer', action: 'update' });
    const changes = JSON.parse(row.changes);
    expect(changes.name).toEqual({ from: 'قبل', to: 'بعد' });
    expect(changes.phone).toBeUndefined();
    expect(row.username).toBe('clerk');
  });

  test('a delete keeps a copy of what was removed', async () => {
    const c = await makeCustomer({ name: 'سيحذف', phone: '777' });
    const res = await request(app).delete(`/api/customers/${c.id}`).set(as(admin));
    expect(res.status).toBe(200);
    const [row] = await logsOf({ entity: 'Customer', action: 'delete' });
    expect(row.entity_id).toBe(c.id);
    expect(row.label).toBe('سيحذف');
    expect(JSON.parse(row.changes).phone).toBe('777');
    expect(await Customer.findByPk(c.id)).toBeNull();
  });

  test('a refused request (no permission) writes nothing', async () => {
    const nobody = await User.create({ username: 'nobody', password: 'x', role: 'user', permissions: {} });
    const res = await request(app).post('/api/customers').set(as(nobody)).send({ name: 'ممنوع' });
    expect(res.status).toBe(403);
    expect(await AuditLog.count({ where: { entity: 'Customer' } })).toBe(0);
  });

  test('a request that fails and rolls back leaves no log', async () => {
    const item = await makeItem();
    const res = await request(app).post('/api/items').set(as(admin)).send({ code: item.code, name: 'مكرر' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await AuditLog.count({ where: { entity: 'Item', action: 'create' } })).toBe(0);
  });
});

describe('what is deliberately not logged or not kept', () => {
  test('changes made outside a request (no signed-in user) are not logged', async () => {
    await makeCustomer({ name: 'من الكود' });
    expect(await AuditLog.count()).toBe(0);
  });

  test('a password is never stored: changing it logs the change without the value', async () => {
    const res = await request(app).post('/api/auth/change-password').set(as(clerk)).send({ current_password: 'pw-clerk-1', new_password: 'pw-clerk-2-new' });
    expect(res.status).toBe(200);
    const [row] = await logsOf({ entity: 'User', action: 'update' });
    expect(row.changes).toContain('(مخفي)');
    expect(row.changes).not.toContain('pw-clerk-2-new');
    expect(row.changes).not.toMatch(/\$2[aby]\$/); // no bcrypt hash either
  });

  test('a customer balance changing as a posting side effect is not logged as an edit', async () => {
    const c = await makeCustomer({ balance: 0 });
    const user = { id: admin.id, username: 'boss' };
    await runWithUser({ user, path: '/api/sales-invoices/1/post' }, () => c.update({ balance: 50 }));
    expect(await AuditLog.count({ where: { entity: 'Customer', action: 'update' } })).toBe(0);
    // the same change made by editing that customer directly is logged
    await runWithUser({ user, path: `/api/customers/${c.id}` }, () => c.update({ balance: 60 }));
    expect(await AuditLog.count({ where: { entity: 'Customer', action: 'update' } })).toBe(1);
  });
});

describe('sign-ins', () => {
  test('a good and a bad login are both logged, without any password', async () => {
    const ok = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'pw-boss-1' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'wrong-guess' });
    expect(bad.status).toBe(401);
    const rows = await AuditLog.findAll({ where: { entity: 'User' }, order: [['id', 'ASC']] });
    expect(rows.map(r => r.action)).toEqual(['login', 'login_failed']);
    expect(rows.every(r => r.username === 'boss')).toBe(true);
    expect(JSON.stringify(rows.map(r => r.get()))).not.toContain('wrong-guess');
  });
});

describe('GET /api/audit-logs', () => {
  test('is for admins only', async () => {
    expect((await request(app).get('/api/audit-logs').set(as(clerk))).status).toBe(403);
    expect((await request(app).get('/api/audit-logs')).status).toBe(401);
  });

  test('lists newest first and filters by user, action, record type and text', async () => {
    await request(app).post('/api/customers').set(as(clerk)).send({ name: 'أول' });
    const second = await request(app).post('/api/customers').set(as(admin)).send({ name: 'ثاني' });
    await request(app).delete(`/api/customers/${second.body.id}`).set(as(admin));

    const all = await request(app).get('/api/audit-logs').set(as(admin));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.rows[0].action).toBe('delete');

    const byUser = await request(app).get('/api/audit-logs').query({ username: 'clerk' }).set(as(admin));
    expect(byUser.body.rows.map(r => r.label)).toEqual(['أول']);

    const byAction = await request(app).get('/api/audit-logs').query({ action: 'delete', entity: 'Customer' }).set(as(admin));
    expect(byAction.body.total).toBe(1);

    const byText = await request(app).get('/api/audit-logs').query({ q: 'ثاني' }).set(as(admin));
    expect(byText.body.total).toBe(2); // its create and its delete

    const page = await request(app).get('/api/audit-logs').query({ limit: 1, offset: 1 }).set(as(admin));
    expect(page.body.rows.length).toBe(1);
    expect(page.body.total).toBe(3);
  });

  test('the filter lists offer the users and record types present in the log', async () => {
    await request(app).post('/api/customers').set(as(clerk)).send({ name: 'أول' });
    const res = await request(app).get('/api/audit-logs/filters').set(as(admin));
    expect(res.body.usernames).toContain('clerk');
    expect(res.body.entities).toContain('Customer');
  });

  test('has no way to edit or delete a log row through the API', async () => {
    await request(app).post('/api/customers').set(as(clerk)).send({ name: 'أول' });
    const [row] = await AuditLog.findAll();
    expect((await request(app).delete(`/api/audit-logs/${row.id}`).set(as(admin))).status).toBe(404);
    expect((await request(app).put(`/api/audit-logs/${row.id}`).set(as(admin)).send({ username: 'x' })).status).toBe(404);
    expect(await AuditLog.count()).toBe(1);
  });
});

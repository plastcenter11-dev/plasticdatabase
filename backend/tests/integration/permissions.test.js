// Authentication and per-module permissions, exercised through the real app
// (app.js: the same middleware wiring the server uses).

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../app');
const { sequelize, User, SalesInvoice } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeItem, makeCustomer } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
const tokenFor = (user, extra = {}) => jwt.sign({ id: user.id, role: user.role, ...extra }, SECRET);
const as = (token) => ({ Authorization: `Bearer ${token}` });

let admin, nobody, viewer, editor, fullAccess, inactive;
let tokens;

const makeUser = (username, role, permissions = {}, extra = {}) =>
  User.create({ username, password: 'x', role, permissions, ...extra });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  admin = await makeUser('admin_u', 'admin');
  nobody = await makeUser('nobody_u', 'user', {});
  viewer = await makeUser('viewer_u', 'user', { sales_invoices: ['view'], cash_receipts: ['view'] });
  editor = await makeUser('editor_u', 'user', { sales_invoices: ['view', 'create', 'edit'], items: ['create', 'edit'], delivery_notes: ['view', 'create'], stock: ['view', 'create'], financial_years: ['view', 'create'] });
  fullAccess = await makeUser('full_u', 'user', { sales_invoices: ['view', 'create', 'edit', 'delete'], settings: ['view', 'edit'], employees: ['view'] });
  inactive = await makeUser('inactive_u', 'user', { sales_invoices: ['view'] }, { is_active: false });
  tokens = Object.fromEntries([admin, nobody, viewer, editor, fullAccess, inactive].map(u => [u.username, tokenFor(u)]));
});

describe('authentication', () => {
  test('no token is refused', async () => {
    expect((await request(app).get('/api/sales-invoices')).status).toBe(401);
  });

  test('a garbage token is refused', async () => {
    expect((await request(app).get('/api/sales-invoices').set(as('not-a-token'))).status).toBe(401);
  });

  test('a token signed with another secret is refused', async () => {
    const forged = jwt.sign({ id: admin.id, role: 'admin' }, 'some-other-secret');
    expect((await request(app).get('/api/sales-invoices').set(as(forged))).status).toBe(401);
  });

  test('an expired token is refused', async () => {
    const expired = jwt.sign({ id: admin.id, role: 'admin' }, SECRET, { expiresIn: -10 });
    expect((await request(app).get('/api/sales-invoices').set(as(expired))).status).toBe(401);
  });

  test('a token for a user that no longer exists is refused', async () => {
    const t = tokenFor(viewer);
    await viewer.destroy();
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(401);
  });

  test('a deactivated user is refused even with a valid token', async () => {
    expect((await request(app).get('/api/sales-invoices').set(as(tokens.inactive_u))).status).toBe(401);
  });

  test('a valid token with the permission is accepted', async () => {
    expect((await request(app).get('/api/sales-invoices').set(as(tokens.viewer_u))).status).toBe(200);
  });
});

describe('module permissions', () => {
  const READ_ENDPOINTS = [
    '/api/sales-invoices', '/api/purchase-invoices', '/api/delivery-notes', '/api/returns/sales', '/api/returns/purchase',
    '/api/finance/cash-receipts', '/api/finance/cash-payments', '/api/finance/checks', '/api/finance/expenses', '/api/finance/other-income',
    '/api/stock/items-stock', '/api/stock/transfers', '/api/stock/assemblies', '/api/employees', '/api/financial-years', '/api/opening-balances',
  ];

  test('a user with no permissions cannot read any business module', async () => {
    for (const url of READ_ENDPOINTS) {
      const res = await request(app).get(url).set(as(tokens.nobody_u));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  test('reference data stays readable to anyone signed in (the dropdowns need it)', async () => {
    for (const url of ['/api/items', '/api/customers', '/api/suppliers', '/api/warehouses']) {
      const res = await request(app).get(url).set(as(tokens.nobody_u));
      expect([url, res.status]).toEqual([url, 200]);
    }
  });

  test('...but creating them still needs the permission', async () => {
    expect((await request(app).post('/api/items').set(as(tokens.nobody_u)).send({ code: 'X-1', name: 'x' })).status).toBe(403);
    expect((await request(app).post('/api/customers').set(as(tokens.nobody_u)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).post('/api/warehouses').set(as(tokens.nobody_u)).send({ name: 'x' })).status).toBe(403);
  });

  test('a permission on one module does not leak into another', async () => {
    // viewer: sales_invoices + cash_receipts only
    for (const [url, status] of [
      ['/api/sales-invoices', 200], ['/api/returns/sales', 200], ['/api/finance/cash-receipts', 200],
      ['/api/purchase-invoices', 403], ['/api/returns/purchase', 403], ['/api/finance/cash-payments', 403], ['/api/finance/checks', 403], ['/api/stock/items-stock', 403],
    ]) {
      const res = await request(app).get(url).set(as(tokens.viewer_u));
      expect([url, res.status]).toEqual([url, status]);
    }
  });
});

describe('actions: view, create, edit and delete are separate permissions', () => {
  test('a view-only user can read but not create, edit, post or delete', async () => {
    const customer = await makeCustomer();
    const invoice = await SalesInvoice.create({ invoice_no: 'SI-P-1', date: '2026-04-01', customer_id: customer.id, total: 10, remaining: 10 });
    const t = tokens.viewer_u;
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(200);
    expect((await request(app).post('/api/sales-invoices').set(as(t)).send({ customer_id: customer.id, invoice_no: 'SI-P-2', date: '2026-04-01' })).status).toBe(403);
    expect((await request(app).put(`/api/sales-invoices/${invoice.id}`).set(as(t)).send({ notes: 'x' })).status).toBe(403);
    expect((await request(app).post(`/api/sales-invoices/${invoice.id}/post`).set(as(t))).status).toBe(403);
    expect((await request(app).delete(`/api/sales-invoices/${invoice.id}`).set(as(t))).status).toBe(403);
    expect(await SalesInvoice.count()).toBe(1);
  });

  test('create + edit lets a user create and post, but deleting (single or bulk) still needs delete', async () => {
    const customer = await makeCustomer();
    const service = await makeItem({ is_stockable: false });
    const t = tokens.editor_u;
    const created = await request(app).post('/api/sales-invoices').set(as(t)).send({
      customer_id: customer.id, invoice_no: 'SI-P-3', date: '2026-04-01', subtotal: 100, total: 100, remaining: 100,
      items: [{ item_id: service.id, quantity: 1, weight: 0, price: 100, discount: 0, total: 100 }],
    });
    expect(created.status).toBe(201);
    expect((await request(app).post(`/api/sales-invoices/${created.body.id}/post`).set(as(t))).status).toBe(200);
    expect((await request(app).delete(`/api/sales-invoices/${created.body.id}`).set(as(t))).status).toBe(403);
    expect((await request(app).post('/api/sales-invoices/bulk-delete').set(as(t)).send({ ids: [created.body.id] })).status).toBe(403);
    expect(await SalesInvoice.count()).toBe(1);
    // the user who may delete can (a draft; posted invoices are protected by the route itself)
    const draft = await SalesInvoice.create({ invoice_no: 'SI-P-4', date: '2026-04-01', customer_id: customer.id, total: 1, remaining: 1 });
    expect((await request(app).delete(`/api/sales-invoices/${draft.id}`).set(as(tokens.full_u))).status).toBe(200);
  });

  test('posting, delivering, confirming and closing count as edits, not creates', async () => {
    const t = tokens.editor_u; // delivery_notes, stock and financial_years: view + create only
    expect((await request(app).post('/api/delivery-notes/1/deliver').set(as(t)).send({})).status).toBe(403);
    expect((await request(app).post('/api/stock/transfers/1/confirm').set(as(t))).status).toBe(403);
    expect((await request(app).post('/api/financial-years/1/close').set(as(t)).send({})).status).toBe(403);
    expect((await request(app).post('/api/financial-years/1/activate').set(as(t))).status).toBe(403);
  });

  test('the item permission follows the action: create yes, delete no', async () => {
    const t = tokens.editor_u;
    const created = await request(app).post('/api/items').set(as(t)).send({ code: 'P-ITM', name: 'item' });
    expect(created.status).toBe(201);
    expect((await request(app).put(`/api/items/${created.body.id}`).set(as(t)).send({ name: 'renamed' })).status).toBe(200);
    expect((await request(app).delete(`/api/items/${created.body.id}`).set(as(t))).status).toBe(403);
  });
});

describe('admin-only areas', () => {
  const ADMIN_ONLY = [
    ['get', '/api/users'], ['post', '/api/users'], ['put', '/api/users/1'], ['delete', '/api/users/1'],
    ['put', '/api/settings'], ['get', '/api/backup'], ['get', '/api/backup/sql'], ['post', '/api/backup/restore'],
  ];

  test('even a user with the settings permission cannot use them', async () => {
    for (const [method, url] of ADMIN_ONLY) {
      const res = await request(app)[method](url).set(as(tokens.full_u)).send({});
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });

  test('a user with no permissions cannot either', async () => {
    for (const [method, url] of ADMIN_ONLY) {
      const res = await request(app)[method](url).set(as(tokens.nobody_u)).send({});
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });

  test('the admin can, and the user list never carries a password', async () => {
    const res = await request(app).get('/api/users').set(as(tokens.admin_u));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(u => u.password === undefined)).toBe(true);
  });

  test('creating a user as admin hashes the password and does not return it', async () => {
    const res = await request(app).post('/api/users').set(as(tokens.admin_u)).send({ username: 'new_u', password: 'secret123', role: 'user', permissions: { items: ['view'] } });
    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
    const stored = await User.findOne({ where: { username: 'new_u' } });
    expect(stored.password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', stored.password)).toBe(true);
  });
});

describe('a token cannot grant itself rights', () => {
  test('claiming role admin inside the token changes nothing: the role is read from the database', async () => {
    const claimsAdmin = tokenFor(nobody, { role: 'admin', permissions: { sales_invoices: ['view', 'create', 'edit', 'delete'] } });
    expect((await request(app).get('/api/sales-invoices').set(as(claimsAdmin))).status).toBe(403);
    expect((await request(app).get('/api/users').set(as(claimsAdmin))).status).toBe(403);
  });

  test('permissions changed by an admin apply to the very next request', async () => {
    const t = tokens.nobody_u;
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(403);
    await nobody.update({ permissions: { sales_invoices: ['view'] } });
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(200);
    await nobody.update({ is_active: false });
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(401);
  });
});

describe('login and password change', () => {
  test('a wrong password and an unknown user both get the same refusal', async () => {
    await User.create({ username: 'login_u', password: await bcrypt.hash('right-pass', 10), role: 'user' });
    const wrong = await request(app).post('/api/auth/login').send({ username: 'login_u', password: 'wrong' });
    const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody-like-this', password: 'x' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  test('the right password returns a working token and never the password hash', async () => {
    await User.create({ username: 'login_u2', password: await bcrypt.hash('right-pass', 10), role: 'user', permissions: { sales_invoices: ['view'] } });
    const res = await request(app).post('/api/auth/login').send({ username: 'login_u2', password: 'right-pass' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect((await request(app).get('/api/sales-invoices').set(as(res.body.token))).status).toBe(200);
  });

  test('changing the password needs the current one', async () => {
    const u = await User.create({ username: 'pw_u', password: await bcrypt.hash('old-pass', 10), role: 'user' });
    const t = tokenFor(u);
    const bad = await request(app).post('/api/auth/change-password').set(as(t)).send({ current_password: 'nope', new_password: 'new-pass' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/change-password').set(as(t)).send({ current_password: 'old-pass', new_password: 'new-pass' });
    expect(ok.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ username: 'pw_u', password: 'new-pass' });
    expect(login.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ username: 'pw_u', password: 'old-pass' })).status).toBe(401);
  });

  test('changing the password without being signed in is refused', async () => {
    expect((await request(app).post('/api/auth/change-password').send({ current_password: 'a', new_password: 'b' })).status).toBe(401);
  });
});

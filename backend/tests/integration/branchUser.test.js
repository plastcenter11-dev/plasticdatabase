// The "branch employee" profile that is handed out to branch staff, exercised
// through the real app: what such an account can do, and what it never can.
//
// Profile (matches the Users screen): view+create+edit on delivery notes and sales
// invoices (+ returns), view+create on cash receipts, checks and stock movements,
// nothing on delete, purchases, payments, expenses, employees, financial years,
// settings.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, SalesInvoice, Customer } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeCustomer } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
const tokenFor = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET);
const as = (t) => ({ Authorization: `Bearer ${t}` });

const BRANCH_PERMS = {
  delivery_notes: ['view', 'create', 'edit'],
  sales_invoices: ['view', 'create', 'edit'],
  cash_receipts: ['view', 'create'],
  checks: ['view', 'create'],
  stock: ['view', 'create'],
};

let branch, admin, t, ta;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  branch = await User.create({ username: 'branch1', password: 'x', role: 'user', permissions: BRANCH_PERMS });
  t = tokenFor(branch);
  ta = tokenFor(admin);
});

describe('branch employee: what is allowed', () => {
  test('can open every screen its job needs', async () => {
    for (const url of [
      '/api/delivery-notes', '/api/sales-invoices', '/api/returns/sales',
      '/api/finance/cash-receipts', '/api/finance/checks', '/api/stock/items-stock', '/api/stock/transfers',
      '/api/items', '/api/customers', '/api/suppliers', '/api/warehouses', '/api/options',
    ]) {
      const res = await request(app).get(url).set(as(t));
      expect([url, res.status]).toEqual([url, 200]);
    }
  });

  test('can record a cash receipt', async () => {
    const customer = await makeCustomer();
    const res = await request(app).post('/api/finance/cash-receipts').set(as(t))
      .send({ customer_id: customer.id, amount: 100, date: '2026-04-01', payment_method: 'cash' });
    expect([200, 201]).toContain(res.status);
  });

  test('can create and edit a sales invoice', async () => {
    const customer = await makeCustomer();
    const inv = await SalesInvoice.create({ invoice_no: 'SI-B-1', date: '2026-04-01', customer_id: customer.id, total: 10, remaining: 10 });
    const edit = await request(app).put(`/api/sales-invoices/${inv.id}`).set(as(t)).send({ notes: 'ok' });
    expect(edit.status).not.toBe(403);
  });
});

describe('branch employee: what is never allowed', () => {
  test('cannot delete anything it is allowed to create', async () => {
    const customer = await makeCustomer();
    const inv = await SalesInvoice.create({ invoice_no: 'SI-B-2', date: '2026-04-01', customer_id: customer.id, total: 10, remaining: 10 });
    expect((await request(app).delete(`/api/sales-invoices/${inv.id}`).set(as(t))).status).toBe(403);
    expect((await request(app).post('/api/sales-invoices/bulk-delete').set(as(t)).send({ ids: [inv.id] })).status).toBe(403);
    expect((await request(app).delete('/api/delivery-notes/1').set(as(t))).status).toBe(403);
    expect(await SalesInvoice.count()).toBe(1);
  });

  test('cannot see purchases, payments, expenses, income, employees, financial years or opening balances', async () => {
    for (const url of [
      '/api/purchase-invoices', '/api/returns/purchase', '/api/finance/cash-payments', '/api/finance/expenses',
      '/api/finance/other-income', '/api/employees', '/api/financial-years', '/api/opening-balances', '/api/settings',
    ]) {
      const res = await request(app).get(url).set(as(t));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  test('cannot reach users, audit log, backup or settings (admin only)', async () => {
    for (const [method, url] of [
      ['get', '/api/users'], ['post', '/api/users'], ['put', '/api/users/1'], ['delete', '/api/users/1'],
      ['get', '/api/audit-logs'],
      ['get', '/api/backup'], ['get', '/api/backup/sql'], ['post', '/api/backup/run'], ['post', '/api/backup/restore'],
      ['get', '/api/backup/copy'], ['put', '/api/backup/copy'], ['get', '/api/backup/browse'],
      ['put', '/api/settings'],
    ]) {
      const res = await request(app)[method](url).set(as(t)).send({});
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });

  test('cannot make itself an admin or widen its own rights', async () => {
    const self = await request(app).put(`/api/users/${branch.id}`).set(as(t)).send({ role: 'admin', permissions: { settings: ['view', 'edit', 'delete'] } });
    expect(self.status).toBe(403);
    const fresh = await User.findByPk(branch.id);
    expect(fresh.role).toBe('user');
    expect(fresh.permissions).toEqual(BRANCH_PERMS);
  });

  test('cannot edit or delete customers, items or warehouses (reference data is read-only)', async () => {
    const customer = await makeCustomer();
    expect((await request(app).put(`/api/customers/${customer.id}`).set(as(t)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/customers/${customer.id}`).set(as(t))).status).toBe(403);
    expect((await request(app).post('/api/items').set(as(t)).send({ code: 'B-1', name: 'x' })).status).toBe(403);
    expect((await request(app).post('/api/warehouses').set(as(t)).send({ name: 'x' })).status).toBe(403);
    expect((await Customer.findByPk(customer.id)).name).toBe(customer.name);
  });

  test('the user list the admin sees never carries a password hash', async () => {
    const res = await request(app).get('/api/users').set(as(ta));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password"/);
  });
});

describe('changes made by the admin apply immediately', () => {
  test('deactivating the account locks it out on the next request', async () => {
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(200);
    await request(app).put(`/api/users/${branch.id}`).set(as(ta)).send({ is_active: false });
    expect((await request(app).get('/api/sales-invoices').set(as(t))).status).toBe(401);
  });

  test('removing a permission takes effect on the next request', async () => {
    await request(app).put(`/api/users/${branch.id}`).set(as(ta)).send({ permissions: { ...BRANCH_PERMS, checks: [] } });
    expect((await request(app).get('/api/finance/checks').set(as(t))).status).toBe(403);
    expect((await request(app).get('/api/finance/cash-receipts').set(as(t))).status).toBe(200);
  });

  test('a password reset by the admin ends the old session', async () => {
    await new Promise(r => setTimeout(r, 1100)); // iat is in whole seconds
    await request(app).put(`/api/users/${branch.id}`).set(as(ta)).send({ password: 'newpass123' });
    const res = await request(app).get('/api/sales-invoices').set(as(t));
    expect(res.status).toBe(401);
  });
});

describe('company details for printing', () => {
  test('a branch user (no settings permission) can read the company details that go on printed documents, and nothing else', async () => {
    const { Settings } = require('../../models');
    await Settings.upsert({ key: 'company_name', value: 'شركة الاختبار' });
    await Settings.upsert({ key: 'company_vat_no', value: '123' });
    await Settings.upsert({ key: 'backup_copy_dir', value: 'G:\secret-folder' });
    await Settings.upsert({ key: 'opt_block_below_cost', value: '1' });
    const res = await request(app).get('/api/options/company').set(as(t));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ company_name: 'شركة الاختبار', company_vat_no: '123' });
    // the full settings still need the settings permission
    expect((await request(app).get('/api/settings').set(as(t))).status).toBe(403);
  });
});

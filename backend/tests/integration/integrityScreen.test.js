// The integrity test run from inside the program (GET /api/integrity), through the real app.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, Stock, Customer, SalesInvoice, StockMovement, CashPayment } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
const as = (t) => ({ Authorization: `Bearer ${t}` });
let adminT, customer, supplier, item, wh;
const run = (t = adminT) => request(app).get('/api/integrity').set(as(t));
const post = (url, body) => request(app).post(url).set(as(adminT)).send(body);
const byCode = (body) => Object.fromEntries(body.results.map(r => [r.code, r]));

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  adminT = jwt.sign({ id: admin.id, role: admin.role }, SECRET);
  wh = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
  supplier = await makeSupplier();
  // a purchase and a sale entered the normal way, so everything agrees
  const p = await post('/api/purchase-invoices', { supplier_id: supplier.id, warehouse_id: wh.id, date: '2026-03-01', paid: 50, items: [{ item_id: item.id, quantity: 10, weight: 100, price: 10 }] });
  await post(`/api/purchase-invoices/${p.body.id}/post`, {});
  const s = await post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: wh.id, date: '2026-03-02', paid: 100, items: [{ item_id: item.id, quantity: 4, weight: 40, price: 20 }] });
  await post(`/api/sales-invoices/${s.body.id}/post`, {});
});

describe('GET /api/integrity', () => {
  test('consistent data: every check runs and none reports an error', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(res.body.errors).toBe(0);
    const checks = byCode(res.body);
    for (const code of ['customer-balances', 'supplier-balances', 'sales-invoice-totals', 'stock-vs-movements', 'orphans']) expect(checks[code]).toBeDefined();
    expect(checks['customer-balances'].examined).toBe(1);
    expect(checks['supplier-balances'].examined).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('تعذّر تنفيذ الفحص');
  });

  test('tampered figures are found and named: an invoice total, a stock balance and a payment that lost its receipt', async () => {
    // balances on screen are worked out from the documents, so what can really go wrong is the documents themselves
    await SalesInvoice.update({ total: 1 }, { where: { customer_id: customer.id } });
    await Stock.increment({ weight: 3 }, { where: { item_id: item.id } });
    await CashPayment.destroy({ where: { supplier_id: supplier.id } });   // the 50 paid on the purchase invoice
    const res = await run();
    expect(res.body.errors).toBeGreaterThanOrEqual(3);
    const checks = byCode(res.body);
    for (const code of ['sales-invoice-totals', 'stock-vs-movements', 'purchase-invoice-payments']) {
      expect([code, checks[code].errors > 0]).toEqual([code, true]);
    }
    expect(checks['stock-vs-movements'].violations[0].message).toContain(item.name);
  });

  test('it only reads: nothing changes by running it', async () => {
    const snap = async () => JSON.stringify([await Customer.findAll({ raw: true }), await Stock.findAll({ raw: true }), await StockMovement.count(), await SalesInvoice.findAll({ raw: true })]);
    const before = await snap();
    await run();
    expect(await snap()).toBe(before);
  });

  test('it is for the admin only, whatever other permissions a user has', async () => {
    expect((await request(app).get('/api/integrity')).status).toBe(401);
    const all = ['view', 'create', 'edit', 'delete'];
    const user = await User.create({ username: 'clerk', password: 'x', role: 'user', permissions: { settings: all, reports: all, customers: all, suppliers: all, stock: all } });
    expect((await run(jwt.sign({ id: user.id }, SECRET))).status).toBe(403);
  });
});

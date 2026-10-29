// The options switched on from the settings screen, and the record protection
// date, exercised through the real app wiring.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, Settings, SalesInvoice, PurchaseInvoice } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeItem, makeCustomer, makeSupplier, makeWarehouse } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
const as = (u) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, role: u.role }, SECRET)}` });

let admin, clerk, warehouse, customer, supplier, item;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  await Settings.destroy({ where: {} });
  admin = await User.create({ username: 'opt_admin', password: 'x', role: 'admin' });
  clerk = await User.create({ username: 'opt_clerk', password: 'x', role: 'user', permissions: { sales_invoices: ['view', 'create', 'edit'], purchase_invoices: ['view', 'create', 'edit'], cash_receipts: ['view', 'create'] } });
  warehouse = await makeWarehouse();
  customer = await makeCustomer();
  supplier = await makeSupplier();
  item = await makeItem({ purchase_price: 10 });
});

const setOption = (key, value) => request(app).put('/api/settings').set(as(admin)).send({ [key]: value });
const salesBody = (over = {}, line = {}) => ({
  customer_id: customer.id, warehouse_id: warehouse.id, date: '2026-05-10', subtotal: 100, total: 100, paid: 100, remaining: 0,
  items: [{ item_id: item.id, quantity: 1, weight: 10, price: 10, discount: 0, total: 100, ...line }], ...over,
});
const stockIn = (qty = 100, wt = 1000) => require('../../models').Stock.create({ item_id: item.id, warehouse_id: warehouse.id, quantity: qty, weight: wt });

describe('reading the options', () => {
  test('every signed-in user can read them, with defaults before anything is saved', async () => {
    const res = await request(app).get('/api/options').set(as(clerk));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ opt_credit_no_limit: '1', opt_auto_tax: '1', opt_block_below_cost: '0', opt_auto_numbering: '1', opt_require_approval: '0', protect_until: '' });
    expect((await request(app).get('/api/options')).status).toBe(401);
  });

  test('only an admin can change them', async () => {
    const res = await request(app).put('/api/settings').set(as(clerk)).send({ opt_block_below_cost: '1' });
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/options').set(as(clerk))).body.opt_block_below_cost).toBe('0');
    expect((await setOption('opt_block_below_cost', '1')).status).toBe(200);
    expect((await request(app).get('/api/options').set(as(clerk))).body.opt_block_below_cost).toBe('1');
  });
});

describe('block selling below cost', () => {
  test('off by default: a sale under cost is accepted', async () => {
    const res = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({}, { price: 5, total: 50 }));
    expect(res.status).toBe(201);
  });

  test('on: a draft below cost is refused, one at or above cost is fine, the line discount counts', async () => {
    await setOption('opt_block_below_cost', '1');
    const low = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({}, { price: 9 }));
    expect(low.status).toBe(400);
    expect(low.body.error).toMatch(/أقل من سعر التكلفة/);
    expect((await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({}, { price: 10 }))).status).toBe(201);
    // 12 with a 20% discount is 9.6 net: under cost
    expect((await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({}, { price: 12, discount: 20 }))).status).toBe(400);
    expect(await SalesInvoice.count()).toBe(1);
  });

  test('on: a draft saved before the option was switched on is still refused at posting', async () => {
    await stockIn();
    const draft = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({}, { price: 5 }));
    await setOption('opt_block_below_cost', '1');
    const post = await request(app).post(`/api/sales-invoices/${draft.body.id}/post`).set(as(clerk));
    expect(post.status).toBe(400);
    expect((await SalesInvoice.findByPk(draft.body.id)).status).toBe('draft');
  });
});

describe('credit sales without a credit limit', () => {
  test('allowed by default', async () => {
    await stockIn();
    const draft = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ paid: 0, remaining: 100 }));
    expect((await request(app).post(`/api/sales-invoices/${draft.body.id}/post`).set(as(clerk))).status).toBe(200);
  });

  test('off: a customer with no limit cannot buy on credit, but can pay in full, and one with a limit can', async () => {
    await stockIn();
    await setOption('opt_credit_no_limit', '0');
    const credit = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ paid: 0, remaining: 100 }));
    const refused = await request(app).post(`/api/sales-invoices/${credit.body.id}/post`).set(as(clerk));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/حد ائتمان/);
    const paid = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody());
    expect((await request(app).post(`/api/sales-invoices/${paid.body.id}/post`).set(as(clerk))).status).toBe(200);
    await customer.update({ credit_limit: 5000 });
    expect((await request(app).post(`/api/sales-invoices/${credit.body.id}/post`).set(as(clerk))).status).toBe(200);
  });
});

describe('invoice numbering', () => {
  test('automatic by default, typed number required when switched off', async () => {
    const auto = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody());
    expect(auto.body.invoice_no).toMatch(/^SI-/);
    await setOption('opt_auto_numbering', '0');
    const missing = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody());
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/رقم الفاتورة مطلوب/);
    const typed = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ invoice_no: 'MY-1' }));
    expect(typed.status).toBe(201);
    expect(typed.body.invoice_no).toBe('MY-1');
    const purchase = await request(app).post('/api/purchase-invoices').set(as(clerk)).send({ supplier_id: supplier.id, warehouse_id: warehouse.id, date: '2026-05-10', total: 10, items: [] });
    expect(purchase.status).toBe(400);
  });
});

describe('approval before posting', () => {
  test('off by default; on: posting needs an admin approval, editing withdraws it', async () => {
    await stockIn();
    await setOption('opt_require_approval', '1');
    const draft = (await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody())).body;
    const early = await request(app).post(`/api/sales-invoices/${draft.id}/post`).set(as(clerk));
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/اعتماد/);
    // a clerk cannot approve
    expect((await request(app).post(`/api/sales-invoices/${draft.id}/approve`).set(as(clerk))).status).toBe(403);
    expect((await request(app).post(`/api/sales-invoices/${draft.id}/approve`).set(as(admin))).status).toBe(200);
    expect((await SalesInvoice.findByPk(draft.id)).approved_at).not.toBeNull();
    // editing the draft after approval withdraws the approval
    await request(app).put(`/api/sales-invoices/${draft.id}`).set(as(clerk)).send({ notes: 'changed' });
    expect((await SalesInvoice.findByPk(draft.id)).approved_at).toBeNull();
    expect((await request(app).post(`/api/sales-invoices/${draft.id}/post`).set(as(clerk))).status).toBe(400);
    await request(app).post(`/api/sales-invoices/${draft.id}/approve`).set(as(admin));
    expect((await request(app).post(`/api/sales-invoices/${draft.id}/post`).set(as(clerk))).status).toBe(200);
  });

  test('the same rule holds for purchase invoices', async () => {
    await setOption('opt_require_approval', '1');
    const draft = (await request(app).post('/api/purchase-invoices').set(as(clerk)).send({ supplier_id: supplier.id, warehouse_id: warehouse.id, date: '2026-05-10', subtotal: 100, total: 100, paid: 0, remaining: 100, items: [{ item_id: item.id, quantity: 1, weight: 10, price: 10, discount: 0, total: 100 }] })).body;
    expect((await request(app).post(`/api/purchase-invoices/${draft.id}/post`).set(as(clerk))).status).toBe(400);
    await request(app).post(`/api/purchase-invoices/${draft.id}/approve`).set(as(admin));
    expect((await request(app).post(`/api/purchase-invoices/${draft.id}/post`).set(as(clerk))).status).toBe(200);
    expect((await PurchaseInvoice.findByPk(draft.id)).status).toBe('posted');
  });
});

describe('record protection date', () => {
  test('documents dated on or before the date are locked for create, edit and delete; later ones are fine', async () => {
    const old = (await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ date: '2026-05-10' }))).body;
    expect((await setOption('protect_until', '2026-05-31')).status).toBe(200);

    const create = await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ date: '2026-05-31' }));
    expect(create.status).toBe(400);
    expect(create.body.error).toMatch(/محمية حتى 2026-05-31/);
    expect((await request(app).put(`/api/sales-invoices/${old.id}`).set(as(clerk)).send({ notes: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/finance/expenses').set(as(admin)).send({ date: '2026-05-01', description: 'e', amount: 5 })).status).toBe(400);
    expect((await request(app).post('/api/sales-invoices').set(as(clerk)).send(salesBody({ date: '2026-06-01' }))).status).toBe(201);
    expect((await request(app).post('/api/finance/expenses').set(as(admin)).send({ date: '2026-06-01', description: 'e', amount: 5 })).status).toBe(201);

    // lifting the protection (an empty date) unlocks everything again
    await setOption('protect_until', '');
    expect((await request(app).put(`/api/sales-invoices/${old.id}`).set(as(clerk)).send({ notes: 'x' })).status).toBe(200);
  });
});

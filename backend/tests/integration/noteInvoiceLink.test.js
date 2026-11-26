// Invoices that come from delivery notes: the sales list carries the note's number, and the posting screen is
// offered the next invoice number.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, SalesInvoice, Stock } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
let adminT, wh, item, customer;
const as = (t) => ({ Authorization: `Bearer ${t}` });
const get = (url, t = adminT) => request(app).get(url).set(as(t));
const post = (url, body, t = adminT) => request(app).post(url).set(as(t)).send(body);

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  adminT = jwt.sign({ id: admin.id, role: admin.role }, SECRET);
  wh = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
  await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 100, weight: 1000 });
});

const direct = (invoice_no) => SalesInvoice.create({ invoice_no, date: '2026-03-01', customer_id: customer.id, total: 10, remaining: 10 });

describe('GET /api/delivery-notes/next-invoice-no', () => {
  test('starts at 1 when there are no invoices', async () => {
    expect((await get('/api/delivery-notes/next-invoice-no')).body).toEqual({ invoice_no: '1' });
  });

  test('is one after the highest plain number (compared as numbers), ignoring numbers with letters', async () => {
    for (const no of ['9', '15', '2', 'SI-000014', 'A-99']) await direct(no);
    expect((await get('/api/delivery-notes/next-invoice-no')).body).toEqual({ invoice_no: '16' });
  });

  test('follows the delivery-notes permission', async () => {
    const make = async (permissions) => jwt.sign({ id: (await User.create({ username: `u${Math.random()}`, password: 'x', role: 'user', permissions })).id }, SECRET);
    expect((await get('/api/delivery-notes/next-invoice-no', await make({ delivery_notes: ['view'] }))).status).toBe(200);
    expect((await get('/api/delivery-notes/next-invoice-no', await make({ sales_invoices: ['view'] }))).status).toBe(403);
  });

  test('the proposed number is accepted when posting, and then moves on', async () => {
    await direct('15');
    const note = (await post('/api/delivery-notes', { date: '2026-03-02', customer_id: customer.id, warehouse_id: wh.id, items: [{ item_id: item.id, net_weight: 10, roll_count: 1 }] })).body;
    const proposed = (await get('/api/delivery-notes/next-invoice-no')).body.invoice_no;
    const res = await post(`/api/delivery-notes/${note.id}/deliver`, { invoice_no: proposed, items: [{ item_id: item.id, price: 5 }] });
    expect(res.status).toBe(200);
    expect((await get('/api/delivery-notes/next-invoice-no')).body.invoice_no).toBe('17');
  });
});

describe('the sales invoice list says which note an invoice came from', () => {
  test('plain and paged lists carry the note number; an invoice entered directly has none', async () => {
    const note = (await post('/api/delivery-notes', { date: '2026-03-02', customer_id: customer.id, warehouse_id: wh.id, items: [{ item_id: item.id, net_weight: 10, roll_count: 1 }] })).body;
    await post(`/api/delivery-notes/${note.id}/deliver`, { invoice_no: '16', items: [{ item_id: item.id, price: 5 }] });
    await direct('SI-000014');
    for (const url of ['/api/sales-invoices', '/api/sales-invoices?page=1&limit=10']) {
      const body = (await get(url)).body;
      const rows = body.rows || body;
      const byNo = Object.fromEntries(rows.map(r => [r.invoice_no, r]));
      expect(byNo['16'].DeliveryNote.note_no).toBe(note.note_no);
      expect(byNo['SI-000014'].DeliveryNote).toBeNull();
    }
  });
});

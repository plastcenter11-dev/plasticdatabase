const request = require('supertest');
const express = require('express');
const { sequelize, SalesInvoice, PurchaseInvoice } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));

let token, alice, bob, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  alice = await makeCustomer({ name: 'Alice' });
  bob = await makeCustomer({ name: 'Bob' });
  supplier = await makeSupplier({ name: 'Sup' });
  for (let i = 1; i <= 7; i++) await SalesInvoice.create({ invoice_no: `SI-${i}`, date: `2026-03-0${i}`, customer_id: i <= 5 ? alice.id : bob.id, status: i % 2 ? 'posted' : 'draft', total: i * 10, remaining: i % 3 === 0 ? 0 : i * 10 });
  for (let i = 1; i <= 3; i++) await PurchaseInvoice.create({ invoice_no: `PI-${i}`, date: '2026-03-01', supplier_id: supplier.id, total: 10 });
});

describe('invoice list paging', () => {
  test('without ?page it still returns the plain array', async () => {
    const res = await request(app).get('/api/sales-invoices').set(auth());
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(7);
  });

  test('pages newest-first with totals', async () => {
    const p1 = await request(app).get('/api/sales-invoices?page=1&limit=3').set(auth());
    expect(p1.body.total).toBe(7);
    expect(p1.body.pages).toBe(3);
    expect(p1.body.rows.map(r => r.invoice_no)).toEqual(['SI-7', 'SI-6', 'SI-5']);
    const p3 = await request(app).get('/api/sales-invoices?page=3&limit=3').set(auth());
    expect(p3.body.rows.map(r => r.invoice_no)).toEqual(['SI-1']);
  });

  test('search matches invoice number or customer name; status filters', async () => {
    const byName = await request(app).get('/api/sales-invoices?page=1&search=Bob').set(auth());
    expect(byName.body.total).toBe(2);
    expect(byName.body.rows[0].Customer.name).toBe('Bob');
    const byNo = await request(app).get('/api/sales-invoices?page=1&search=SI-3').set(auth());
    expect(byNo.body.total).toBe(1);
    const posted = await request(app).get('/api/sales-invoices?page=1&status=posted').set(auth());
    expect(posted.body.total).toBe(4);
  });

  test('sorts by a column in either direction, newest first on ties', async () => {
    const asc = await request(app).get('/api/sales-invoices?page=1&limit=3&sort=total&dir=asc').set(auth());
    expect(asc.body.rows.map(r => r.invoice_no)).toEqual(['SI-1', 'SI-2', 'SI-3']);
    const desc = await request(app).get('/api/sales-invoices?page=1&limit=3&sort=total&dir=desc').set(auth());
    expect(desc.body.rows.map(r => r.invoice_no)).toEqual(['SI-7', 'SI-6', 'SI-5']);
    const byParty = await request(app).get('/api/sales-invoices?page=1&limit=25&sort=party&dir=asc').set(auth());
    expect(byParty.body.rows[0].Customer.name).toBe('Alice');
    expect(byParty.body.rows[byParty.body.rows.length - 1].Customer.name).toBe('Bob');
  });

  test('filters by date range, party and remaining balance', async () => {
    const range = await request(app).get('/api/sales-invoices?page=1&from=2026-03-03&to=2026-03-05').set(auth());
    expect(range.body.rows.map(r => r.invoice_no).sort()).toEqual(['SI-3', 'SI-4', 'SI-5']);
    const from = await request(app).get('/api/sales-invoices?page=1&from=2026-03-06').set(auth());
    expect(from.body.total).toBe(2);
    const bobOnly = await request(app).get(`/api/sales-invoices?page=1&party_id=${bob.id}`).set(auth());
    expect(bobOnly.body.total).toBe(2);
    const paid = await request(app).get('/api/sales-invoices?page=1&remaining=paid').set(auth());
    expect(paid.body.rows.map(r => r.invoice_no).sort()).toEqual(['SI-3', 'SI-6']);
    const open = await request(app).get('/api/sales-invoices?page=1&remaining=open').set(auth());
    expect(open.body.total).toBe(5);
  });

  test('purchase list pages too', async () => {
    const res = await request(app).get('/api/purchase-invoices?page=1&limit=2&search=Sup').set(auth());
    expect(res.body.total).toBe(3);
    expect(res.body.rows).toHaveLength(2);
  });
});

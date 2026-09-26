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
  for (let i = 1; i <= 7; i++) await SalesInvoice.create({ invoice_no: `SI-${i}`, date: '2026-03-01', customer_id: i <= 5 ? alice.id : bob.id, status: i % 2 ? 'posted' : 'draft', total: 10 });
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

  test('purchase list pages too', async () => {
    const res = await request(app).get('/api/purchase-invoices?page=1&limit=2&search=Sup').set(auth());
    expect(res.body.total).toBe(3);
    expect(res.body.rows).toHaveLength(2);
  });
});

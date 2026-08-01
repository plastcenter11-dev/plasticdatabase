const request = require('supertest');
const express = require('express');
const { sequelize, SalesInvoice, Item, Stock, Customer } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));

let token, warehouse, item, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
  // seed stock so posting doesn't fail on availability check
  await Stock.create({ item_id: item.id, warehouse_id: warehouse.id, quantity: 100, weight: 1000 });
});

function payload(overrides = {}) {
  return {
    customer_id: customer.id, warehouse_id: warehouse.id,
    invoice_no: `SI-${Date.now()}-${Math.random()}`,
    date: '2026-03-01', subtotal: 500, discount: 0, tax_rate: 14, tax_amount: 70, total: 570,
    paid: 0, remaining: 570,
    items: [{ item_id: item.id, quantity: 10, weight: 50, price: 50, discount: 0, total: 500 }],
    ...overrides,
  };
}

describe('POST /api/sales-invoices', () => {
  test('creates a draft invoice', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  test('money reconciles: total = subtotal - discount + tax', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload({ subtotal: 1000, discount: 100, tax_amount: 126, total: 1026 }));
    const inv = await SalesInvoice.findByPk(res.body.id);
    expect(Number(inv.total)).toBeCloseTo(Number(inv.subtotal) - Number(inv.discount || 0) + Number(inv.tax_amount), 2);
  });
});

describe('POST /api/sales-invoices/:id/post', () => {
  test('deducts stock from the quantity field for the sold quantity', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(90);
    expect(Number(stock.weight)).toBe(950);
  });

  test('updates item sale_price on post', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    const updated = await Item.findByPk(item.id);
    expect(Number(updated.sale_price)).toBe(50);
  });

  test('increments customer balance by remaining', async () => {
    const before = Number(customer.balance);
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    const c = await Customer.findByPk(customer.id);
    expect(Number(c.balance)).toBeCloseTo(before + 570, 2);
  });

  test('posting twice is rejected', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    const r1 = await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    expect(r2.status).toBe(400);
  });

  test('posting is rejected when stock is insufficient', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload({
      items: [{ item_id: item.id, quantity: 99999, weight: 50, price: 50, discount: 0, total: 500 }],
    }));
    const r = await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    expect(r.status).toBe(400);
  });
});

describe('DELETE /api/sales-invoices/:id', () => {
  test('deleting a draft invoice succeeds', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    const del = await request(app).delete(`/api/sales-invoices/${res.body.id}`).set(auth());
    expect(del.status).toBe(200);
  });

  test('deleting a posted invoice is rejected', async () => {
    const res = await request(app).post('/api/sales-invoices').set(auth()).send(payload());
    await request(app).post(`/api/sales-invoices/${res.body.id}/post`).set(auth());
    const del = await request(app).delete(`/api/sales-invoices/${res.body.id}`).set(auth());
    expect(del.status).toBe(400);
  });
});

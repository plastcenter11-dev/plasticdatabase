const request = require('supertest');
const express = require('express');
const { sequelize, SalesOrderItem } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeItem, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/sales-orders', require('../../routes/salesOrders'));

let token, item, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  item = await makeItem();
  customer = await makeCustomer();
});

describe('POST /api/sales-orders', () => {
  test('total is computed from weight x price, not quantity x price, when weight is present', async () => {
    // weight-based total = 10 * 113 = 1130; quantity-based would be 1 * 113 = 113.
    const res = await request(app).post('/api/sales-orders').set(auth()).send({
      customer_id: customer.id, date: '2026-03-01',
      items: [{ item_id: item.id, quantity: 1, weight: 10, price: 113 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(1130);
    expect(Number(res.body.items[0].total)).toBe(1130);
    expect(Number(res.body.items[0].weight)).toBe(10);
  });

  test('falls back to quantity x price when weight is absent', async () => {
    const res = await request(app).post('/api/sales-orders').set(auth()).send({
      customer_id: customer.id, date: '2026-03-01',
      items: [{ item_id: item.id, quantity: 3, price: 113 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(339);
  });

  test('applies tax_rate on top of the weight-based line total', async () => {
    // 10kg * 100 = 1000 subtotal, +14% tax = 1140.
    const res = await request(app).post('/api/sales-orders').set(auth()).send({
      customer_id: customer.id, date: '2026-03-01',
      items: [{ item_id: item.id, quantity: 1, weight: 10, price: 100, tax_rate: 14 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(1140);
  });
});

describe('PUT /api/sales-orders/:id', () => {
  test('updating items recomputes total from weight, not quantity', async () => {
    const created = await request(app).post('/api/sales-orders').set(auth()).send({
      customer_id: customer.id, date: '2026-03-01',
      items: [{ item_id: item.id, quantity: 1, weight: 10, price: 100 }],
    });
    const res = await request(app).put(`/api/sales-orders/${created.body.id}`).set(auth()).send({
      items: [{ item_id: item.id, quantity: 1, weight: 20, price: 100 }],
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(2000);
    const stored = await SalesOrderItem.findOne({ where: { order_id: created.body.id } });
    expect(Number(stored.weight)).toBe(20);
  });
});

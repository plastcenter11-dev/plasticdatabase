const request = require('supertest');
const express = require('express');
const { sequelize, Stock, Supplier, Customer } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeSupplier, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/returns', require('../../routes/returns'));

let token, warehouse, item, supplier, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  supplier = await makeSupplier({ balance: 1000 });
  customer = await makeCustomer({ balance: 1000 });
  await Stock.create({ item_id: item.id, warehouse_id: warehouse.id, quantity: 50, weight: 500 });
});

describe('POST /api/returns/purchase', () => {
  test('with warehouse_id: decrements stock and decrements supplier balance', async () => {
    const res = await request(app).post('/api/returns/purchase').set(auth()).send({
      supplier_id: supplier.id, warehouse_id: warehouse.id, date: '2026-03-10', reason: 'test',
      total: 200, items: [{ item_id: item.id, quantity: 5, weight: 50, price: 40, total: 200 }],
    });
    expect(res.status).toBe(201);
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(45);
    expect(Number(stock.weight)).toBe(450);
    const sup = await Supplier.findByPk(supplier.id);
    expect(Number(sup.balance)).toBe(800);
  });

  test('without warehouse_id: stock untouched but supplier balance still decremented', async () => {
    const res = await request(app).post('/api/returns/purchase').set(auth()).send({
      supplier_id: supplier.id, date: '2026-03-10', reason: 'test',
      total: 200, items: [{ item_id: item.id, quantity: 5, weight: 50, price: 40, total: 200 }],
    });
    expect(res.status).toBe(201);
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(50);
    const sup = await Supplier.findByPk(supplier.id);
    expect(Number(sup.balance)).toBe(800);
  });
});

describe('DELETE /api/returns/purchase/:id', () => {
  test('reverses stock and supplier balance', async () => {
    const res = await request(app).post('/api/returns/purchase').set(auth()).send({
      supplier_id: supplier.id, warehouse_id: warehouse.id, date: '2026-03-10', reason: 'test',
      total: 200, items: [{ item_id: item.id, quantity: 5, weight: 50, price: 40, total: 200 }],
    });
    await request(app).delete(`/api/returns/purchase/${res.body.id}`).set(auth());
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(50);
    const sup = await Supplier.findByPk(supplier.id);
    expect(Number(sup.balance)).toBe(1000);
  });
});

describe('POST /api/returns/sales', () => {
  test('with warehouse_id: increments stock and decrements customer balance', async () => {
    const res = await request(app).post('/api/returns/sales').set(auth()).send({
      customer_id: customer.id, warehouse_id: warehouse.id, date: '2026-03-10', reason: 'test',
      total: 200, items: [{ item_id: item.id, quantity: 5, price: 40, total: 200 }],
    });
    expect(res.status).toBe(201);
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(55);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(800);
  });
});

describe('DELETE /api/returns/sales/:id', () => {
  test('reverses stock and customer balance', async () => {
    const res = await request(app).post('/api/returns/sales').set(auth()).send({
      customer_id: customer.id, warehouse_id: warehouse.id, date: '2026-03-10', reason: 'test',
      total: 200, items: [{ item_id: item.id, quantity: 5, price: 40, total: 200 }],
    });
    await request(app).delete(`/api/returns/sales/${res.body.id}`).set(auth());
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.quantity)).toBe(50);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(1000);
  });
});

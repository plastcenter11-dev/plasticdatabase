const request = require('supertest');
const express = require('express');
const { sequelize, DeliveryNote, DeliveryNoteItem, SalesInvoice, Customer, Item, Warehouse, Stock, StockMovement } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/delivery-notes', require('../../routes/deliveryNotes'));

let token, warehouse, item, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await syncDb();
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
});

async function createNote(overrides = {}) {
  const res = await request(app).post('/api/delivery-notes').set(auth()).send({
    date: '2026-03-01', customer_id: customer.id, warehouse_id: warehouse.id,
    items: [{ item_id: item.id, net_weight: 100, roll_count: 10 }],
    ...overrides,
  });
  return res;
}

describe('POST /api/delivery-notes', () => {
  test('creates a pending note', async () => {
    const res = await createNote();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });
});

describe('POST /api/delivery-notes/:id/deliver', () => {
  test('with explicit warehouse_id in deliver body creates linked SalesInvoice with that warehouse', async () => {
    const other = await makeWarehouse({ name: 'مخزن آخر' });
    const note = (await createNote({ warehouse_id: null })).body;
    const res = await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({ warehouse_id: other.id });
    expect(res.status).toBe(200);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(inv.warehouse_id).toBe(other.id);
  });

  test('without warehouse_id in body falls back to the note warehouse_id', async () => {
    const note = (await createNote()).body;
    const res = await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    expect(res.status).toBe(200);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(inv.warehouse_id).toBe(warehouse.id);
  });

  test('deducts stock: weight from net_weight, quantity from roll_count, separately', async () => {
    const note = (await createNote({ items: [{ item_id: item.id, net_weight: 40, roll_count: 3 }] })).body;
    await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(-40);
    expect(Number(stock.quantity)).toBe(-3);
  });

  test('updates item sale_price from the price entered at delivery time', async () => {
    const note = (await createNote()).body;
    await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({
      items: [{ item_id: item.id, price: 77 }],
    });
    const updated = await Item.findByPk(item.id);
    expect(Number(updated.sale_price)).toBe(77);
  });

  test('creates a StockMovement per delivered item', async () => {
    const note = (await createNote()).body;
    await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    const mv = await StockMovement.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(mv).not.toBeNull();
  });

  test('increments customer balance by the invoice total', async () => {
    const balBefore = Number(customer.balance);
    const note = (await createNote()).body;
    const res = await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    const c = await Customer.findByPk(customer.id);
    expect(Number(c.balance)).toBeCloseTo(balBefore + Number(inv.total), 2);
  });

  test('delivering twice is rejected', async () => {
    const note = (await createNote()).body;
    const r1 = await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    expect(r2.status).toBe(400);
  });
});

describe('DELETE /api/delivery-notes/:id', () => {
  test('deleting a delivered note is rejected', async () => {
    const note = (await createNote()).body;
    await request(app).post(`/api/delivery-notes/${note.id}/deliver`).set(auth()).send({});
    const res = await request(app).delete(`/api/delivery-notes/${note.id}`).set(auth());
    expect(res.status).toBe(400);
  });

  test('deleting a pending note succeeds', async () => {
    const note = (await createNote()).body;
    const res = await request(app).delete(`/api/delivery-notes/${note.id}`).set(auth());
    expect(res.status).toBe(200);
  });
});

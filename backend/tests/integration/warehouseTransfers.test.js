const request = require('supertest');
const express = require('express');
const { sequelize, Stock, WarehouseTransfer } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/stock', require('../../routes/stock'));

let token, fromWh, toWh, item;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  fromWh = await makeWarehouse({ name: 'مخزن المصدر' });
  toWh = await makeWarehouse({ name: 'مخزن الوجهة' });
  item = await makeItem();
  await Stock.create({ item_id: item.id, warehouse_id: fromWh.id, quantity: 50, weight: 500 });
});

async function createTransfer(qty = 20, weight = 200) {
  const res = await request(app).post('/api/stock/transfers').set(auth()).send({
    date: '2026-03-05', from_warehouse_id: fromWh.id, to_warehouse_id: toWh.id,
    items: [{ item_id: item.id, quantity: qty, weight }],
  });
  return res.body;
}

describe('POST /api/stock/transfers/:id/confirm', () => {
  test('decrements source and increments destination by the same amount', async () => {
    const transfer = await createTransfer(20, 200);
    const res = await request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth());
    expect(res.status).toBe(200);
    const from = await Stock.findOne({ where: { item_id: item.id, warehouse_id: fromWh.id } });
    const to = await Stock.findOne({ where: { item_id: item.id, warehouse_id: toWh.id } });
    expect(Number(from.quantity)).toBe(30);
    expect(Number(to.quantity)).toBe(20);
    expect(Number(from.weight)).toBe(300);
    expect(Number(to.weight)).toBe(200);
  });

  test('rejects transfer exceeding available stock, leaving stock unchanged (never net-zero on error)', async () => {
    const transfer = await createTransfer(999, 999);
    const fromBefore = await Stock.findOne({ where: { item_id: item.id, warehouse_id: fromWh.id } });
    const res = await request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth());
    expect(res.status).toBe(400);
    const fromAfter = await Stock.findOne({ where: { item_id: item.id, warehouse_id: fromWh.id } });
    const toAfter = await Stock.findOne({ where: { item_id: item.id, warehouse_id: toWh.id } });
    expect(Number(fromAfter.quantity)).toBe(Number(fromBefore.quantity));
    expect(toAfter).toBeNull();
    const t = await WarehouseTransfer.findByPk(transfer.id);
    expect(t.status).toBe('pending');
  });

  test('confirming twice is rejected and does not double-move stock', async () => {
    const transfer = await createTransfer(10, 100);
    const r1 = await request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth());
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth());
    expect(r2.status).toBe(400);
    const to = await Stock.findOne({ where: { item_id: item.id, warehouse_id: toWh.id } });
    expect(Number(to.quantity)).toBe(10);
  });

  test('two concurrent confirm requests on the same transfer only move stock once (row lock)', async () => {
    const transfer = await createTransfer(10, 100);
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth()),
      request(app).post(`/api/stock/transfers/${transfer.id}/confirm`).set(auth()),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
    const from = await Stock.findOne({ where: { item_id: item.id, warehouse_id: fromWh.id } });
    const to = await Stock.findOne({ where: { item_id: item.id, warehouse_id: toWh.id } });
    expect(Number(from.quantity)).toBe(40);
    expect(Number(to.quantity)).toBe(10);
  });
});

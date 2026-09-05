const request = require('supertest');
const express = require('express');
const { sequelize, Item, StockMovement } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeItem, makeWarehouse } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/items', require('../../routes/items'));

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
});

describe('DELETE /api/items/:id', () => {
  test('deletes an item with no historical usage', async () => {
    const item = await makeItem();
    const res = await request(app).delete(`/api/items/${item.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(await Item.findByPk(item.id)).toBeNull();
  });

  test('rejects deleting an item that has a StockMovement (has been used)', async () => {
    const item = await makeItem();
    const warehouse = await makeWarehouse();
    await StockMovement.create({
      item_id: item.id, warehouse_id: warehouse.id, movement_type: 'إضافة',
      quantity: 1, weight: 1, date: '2026-01-01', description: 'test', reference: 'TEST',
    });

    const res = await request(app).delete(`/api/items/${item.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Item.findByPk(item.id)).not.toBeNull();
  });
});

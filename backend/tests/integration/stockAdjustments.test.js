const request = require('supertest');
const express = require('express');
const { sequelize, StockMovement } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/stock', require('../../routes/stock'));

let token, warehouse, item;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
});

describe('GET /api/stock/adjustments', () => {
  test('only returns manual adjustment types, excluding invoice/transfer/assembly-generated movements', async () => {
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: 1, weight: 10, date: '2026-01-01', description: '', reference: 'A' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'صرف', quantity: 1, weight: 5, date: '2026-01-01', description: '', reference: 'B' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'تعديل جرد', quantity: 1, weight: 20, date: '2026-01-01', description: '', reference: 'C' });
    // Movements generated elsewhere in the app - should NOT show up here.
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'فاتورة شراء', quantity: 1, weight: 30, date: '2026-01-01', description: '', reference: 'D' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'تحويل داخل', quantity: 1, weight: 40, date: '2026-01-01', description: '', reference: 'E' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'تحويل خارج', quantity: 1, weight: 40, date: '2026-01-01', description: '', reference: 'F' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'تركيب', quantity: 1, weight: 50, date: '2026-01-01', description: '', reference: 'G' });

    const res = await request(app).get('/api/stock/adjustments').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    const types = res.body.map(r => r.movement_type).sort();
    expect(types).toEqual(['إضافة', 'تعديل جرد', 'صرف'].sort());
  });

  test('type query param still filters to just that one type', async () => {
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: 1, weight: 10, date: '2026-01-01', description: '', reference: 'A' });
    await StockMovement.create({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'صرف', quantity: 1, weight: 5, date: '2026-01-01', description: '', reference: 'B' });

    const res = await request(app).get('/api/stock/adjustments').query({ type: 'صرف' }).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].movement_type).toBe('صرف');
  });
});

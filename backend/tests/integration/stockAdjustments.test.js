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

describe('non-stock items in manual adjustments', () => {
  const { Stock } = require('../../models');
  const body = (it, extra = {}) => ({ item_id: it.id, movement_type: 'صرف', quantity: 1, weight: 5, unit_price: 10, date: '2026-01-01', ...extra });

  test('POST for a non-stock item records the movement with no warehouse and creates no Stock row', async () => {
    const service = await makeItem({ is_stockable: false });
    const res = await request(app).post('/api/stock/adjustments').set(auth()).send(body(service, { warehouse_id: warehouse.id }));
    expect(res.status).toBe(201);
    expect(res.body.warehouse_id).toBeNull();
    expect(await Stock.count({ where: { item_id: service.id } })).toBe(0);
  });

  test('POST for a stock item without a warehouse is rejected', async () => {
    const res = await request(app).post('/api/stock/adjustments').set(auth()).send(body(item));
    expect(res.status).toBe(400);
  });

  test('DELETE of a no-warehouse movement succeeds and touches no stock', async () => {
    const service = await makeItem({ is_stockable: false });
    const created = await request(app).post('/api/stock/adjustments').set(auth()).send(body(service));
    const del = await request(app).delete(`/api/stock/adjustments/${created.body.id}`).set(auth());
    expect(del.status).toBe(200);
    expect(await Stock.count({ where: { item_id: service.id } })).toBe(0);
  });

  test('POST for a stock item still moves stock as before', async () => {
    const res = await request(app).post('/api/stock/adjustments').set(auth()).send(body(item, { movement_type: 'إضافة', warehouse_id: warehouse.id }));
    expect(res.status).toBe(201);
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(5);
  });
});

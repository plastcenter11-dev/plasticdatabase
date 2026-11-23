// A closed (or protected) financial year locks the MANUAL stock movements too, not only the financial
// documents: issue / receive / stock-count adjustments, warehouse transfers and item assemblies dated inside
// it cannot be created, edited, confirmed or deleted. Reading them is never blocked.

const request = require('supertest');
const express = require('express');
const { sequelize, Stock, StockMovement, FinancialYear, Settings, WarehouseTransfer, ItemAssembly } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/stock', require('../../routes/stock'));

let token, wh, wh2, item, comp;
const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (url, body) => request(app).post(url).set(auth()).send(body);
const put = (url, body) => request(app).put(url).set(auth()).send(body);
const del = (url) => request(app).delete(url).set(auth());

const CLOSED = '2026-06-10';   // inside the year closed below
const OPEN = '2027-03-10';     // outside every closed year
const closeYear = () => FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: false, is_closed: true });
const stockOf = async (i, w) => { const s = await Stock.findOne({ where: { item_id: i.id, warehouse_id: w.id } }); return s ? Number(s.weight) : 0; };

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  wh = await makeWarehouse({ name: 'W1' });
  wh2 = await makeWarehouse({ name: 'W2' });
  item = await makeItem();
  comp = await makeItem();
  await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 100, weight: 1000 });
  await Stock.create({ item_id: comp.id, warehouse_id: wh.id, quantity: 100, weight: 1000 });
});

const adj = (date, type = 'إضافة', weight = 10) => ({ item_id: item.id, warehouse_id: wh.id, movement_type: type, quantity: 1, weight, date, description: 't' });

describe('adjustments (issue / receive / count)', () => {
  test('a movement dated in a closed year is refused and changes nothing', async () => {
    await closeYear();
    for (const type of ['إضافة', 'صرف', 'تعديل جرد']) {
      const res = await post('/api/stock/adjustments', adj(CLOSED, type));
      expect([type, res.status]).toEqual([type, 400]);
      expect(res.body.error).toMatch(/مقفولة/);
    }
    expect(await StockMovement.count()).toBe(0);
    expect(await stockOf(item, wh)).toBe(1000);
  });

  test('the same movement dated outside the closed year is accepted', async () => {
    await closeYear();
    const res = await post('/api/stock/adjustments', adj(OPEN));
    expect(res.status).toBe(201);
    expect(await stockOf(item, wh)).toBe(1010);
  });

  test('editing or deleting a movement that now sits in a closed year is refused, and so is moving one into it', async () => {
    const made = (await post('/api/stock/adjustments', adj(CLOSED))).body;   // year still open: accepted
    expect(await stockOf(item, wh)).toBe(1010);
    await closeYear();
    expect((await put(`/api/stock/adjustments/${made.id}`, adj(CLOSED, 'إضافة', 99))).status).toBe(400);
    expect((await del(`/api/stock/adjustments/${made.id}`)).status).toBe(400);
    expect(await stockOf(item, wh)).toBe(1010);
    expect(await StockMovement.count()).toBe(1);

    const open = (await post('/api/stock/adjustments', adj(OPEN))).body;
    expect((await put(`/api/stock/adjustments/${open.id}`, adj(CLOSED))).status).toBe(400);   // moved INTO the closed year
    expect(String((await StockMovement.findByPk(open.id)).date)).toBe(OPEN);
    expect((await put(`/api/stock/adjustments/${open.id}`, adj(OPEN, 'إضافة', 20))).status).toBe(200);   // still editable outside it
  });

  test('re-opening the year unlocks it again', async () => {
    const y = await closeYear();
    expect((await post('/api/stock/adjustments', adj(CLOSED))).status).toBe(400);
    await y.update({ is_closed: false });
    expect((await post('/api/stock/adjustments', adj(CLOSED))).status).toBe(201);
  });

  test('reading is never blocked: the movements and the stock of a closed year can still be looked at', async () => {
    await post('/api/stock/adjustments', adj(CLOSED));
    await closeYear();
    expect((await request(app).get('/api/stock/adjustments').set(auth())).status).toBe(200);
    expect((await request(app).get(`/api/stock/movements/${item.id}`).set(auth())).status).toBe(200);
    expect((await request(app).get('/api/stock/items-stock').set(auth())).status).toBe(200);
  });

  test('"protect records until" works the same way', async () => {
    await Settings.upsert({ key: 'protect_until', value: '2026-12-31' });
    expect((await post('/api/stock/adjustments', adj(CLOSED))).status).toBe(400);
    expect((await post('/api/stock/adjustments', adj(OPEN))).status).toBe(201);
  });
});

describe('warehouse transfers', () => {
  const transfer = (date) => ({ date, from_warehouse_id: wh.id, to_warehouse_id: wh2.id, items: [{ item_id: item.id, quantity: 1, weight: 100 }] });

  test('creating one dated in a closed year is refused', async () => {
    await closeYear();
    expect((await post('/api/stock/transfers', transfer(CLOSED))).status).toBe(400);
    expect(await WarehouseTransfer.count()).toBe(0);
    expect((await post('/api/stock/transfers', transfer(OPEN))).status).toBe(201);
  });

  test('confirming one that is dated in a year closed in the meantime is refused, and moves nothing', async () => {
    const t = (await post('/api/stock/transfers', transfer(CLOSED))).body;
    await closeYear();
    const res = await post(`/api/stock/transfers/${t.id}/confirm`, {});
    expect(res.status).toBe(400);
    expect((await WarehouseTransfer.findByPk(t.id)).status).toBe('pending');
    expect(await stockOf(item, wh)).toBe(1000);
    expect(await stockOf(item, wh2)).toBe(0);
    expect(await StockMovement.count()).toBe(0);
  });
});

describe('item assemblies', () => {
  const assembly = (date) => ({
    date, assembled_item_id: item.id, assembled_qty: 1, assembled_weight: 50, warehouse_id: wh.id, output_warehouse_id: wh.id,
    components: [{ item_id: comp.id, quantity: 1, weight: 50, warehouse_id: wh.id }],
  });

  test('creating one dated in a closed year is refused', async () => {
    await closeYear();
    expect((await post('/api/stock/assemblies', assembly(CLOSED))).status).toBe(400);
    expect(await ItemAssembly.count()).toBe(0);
    expect(await stockOf(comp, wh)).toBe(1000);
    expect((await post('/api/stock/assemblies', assembly(OPEN))).status).toBe(201);
  });

  test('editing or deleting one that now sits in a closed year is refused, leaving stock as it was', async () => {
    const made = (await post('/api/stock/assemblies', assembly(CLOSED))).body;   // year still open
    expect(made.id).toBeTruthy();
    const afterComp = await stockOf(comp, wh), afterItem = await stockOf(item, wh);
    await closeYear();
    expect((await put(`/api/stock/assemblies/${made.id}`, assembly(CLOSED))).status).toBe(400);
    expect((await del(`/api/stock/assemblies/${made.id}`)).status).toBe(400);
    expect(await ItemAssembly.count()).toBe(1);
    expect(await stockOf(comp, wh)).toBe(afterComp);
    expect(await stockOf(item, wh)).toBe(afterItem);
  });
});

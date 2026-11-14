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

describe("POST/PUT /api/items with blank optional fields", () => {
  test("a blank category, type and width are stored as null instead of failing", async () => {
    const res = await request(app).post("/api/items").set(auth()).send({ code: "ITM-BLANK-1", name: "blank fk", category_id: "", type_id: "", width: "", is_stockable: false });
    expect(res.status).toBe(201);
    const saved = await Item.findByPk(res.body.id);
    expect(saved.category_id).toBeNull();
    expect(saved.type_id).toBeNull();
    expect(saved.width).toBeNull();
  });

  test("editing an item can clear its category with a blank value", async () => {
    const created = await request(app).post("/api/items").set(auth()).send({ code: "ITM-BLANK-2", name: "clear me", is_stockable: false });
    const res = await request(app).put("/api/items/" + created.body.id).set(auth()).send({ name: "cleared", category_id: "" });
    expect(res.status).toBe(200);
    expect((await Item.findByPk(created.body.id)).category_id).toBeNull();
  });
});

describe('PUT /api/items/:id - turning a stock item into a non-stock one', () => {
  const { Stock } = require('../../models');

  test('is refused while the item still has a balance in a warehouse', async () => {
    const item = await makeItem();
    const wh = await makeWarehouse();
    await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 2, weight: 20 });
    const res = await request(app).put(`/api/items/${item.id}`).set(auth()).send({ is_stockable: false });
    expect(res.status).toBe(400);
    expect((await Item.findByPk(item.id)).is_stockable).toBe(true);
  });

  test('is refused for a negative balance too', async () => {
    const item = await makeItem();
    const wh = await makeWarehouse();
    await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 0, weight: -5 });
    const res = await request(app).put(`/api/items/${item.id}`).set(auth()).send({ is_stockable: false });
    expect(res.status).toBe(400);
  });

  test('is allowed once every balance is zero', async () => {
    const item = await makeItem();
    const wh = await makeWarehouse();
    await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 0, weight: 0 });
    const res = await request(app).put(`/api/items/${item.id}`).set(auth()).send({ is_stockable: false });
    expect(res.status).toBe(200);
    expect((await Item.findByPk(item.id)).is_stockable).toBe(false);
  });

  test('other edits of an item that has stock are not affected', async () => {
    const item = await makeItem();
    const wh = await makeWarehouse();
    await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 2, weight: 20 });
    const res = await request(app).put(`/api/items/${item.id}`).set(auth()).send({ name: 'new name', is_stockable: true });
    expect(res.status).toBe(200);
  });
});

const request = require('supertest');
const express = require('express');
const { sequelize, Item, Stock } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/stock', require('../../routes/stock'));

let token, warehouse;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
});

describe('POST /api/stock/assemblies — cost roll-up', () => {
  test('sets the assembled item purchase_price from the components actual current prices', async () => {
    const compA = await makeItem({ purchase_price: 10 });
    const compB = await makeItem({ purchase_price: 20 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: compA.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });
    await Stock.create({ item_id: compB.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    // 60kg of compA (@10/kg = 600) + 40kg of compB (@20/kg = 800) = 1400 total
    // cost, producing 100kg of the assembled item -> 14/kg.
    const res = await request(app).post('/api/stock/assemblies').set(auth()).send({
      date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
      warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [
        { item_id: compA.id, quantity: 6, weight: 60, warehouse_id: warehouse.id },
        { item_id: compB.id, quantity: 4, weight: 40, warehouse_id: warehouse.id },
      ],
    });
    expect(res.status).toBe(201);
    const updated = await Item.findByPk(assembled.id);
    expect(Number(updated.purchase_price)).toBe(14);
  });

  test('falls back to quantity-based cost when the output has no weight', async () => {
    const comp = await makeItem({ purchase_price: 5 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: comp.id, warehouse_id: warehouse.id, quantity: 100, weight: 0 });

    const res = await request(app).post('/api/stock/assemblies').set(auth()).send({
      date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 0,
      warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [{ item_id: comp.id, quantity: 20, weight: 0, warehouse_id: warehouse.id }],
    });
    expect(res.status).toBe(201);
    // 20 units @ 5 = 100 total cost / 10 produced units = 10 per unit.
    const updated = await Item.findByPk(assembled.id);
    expect(Number(updated.purchase_price)).toBe(10);
  });

  test('recomputes the cost on edit when a component price or mix changes', async () => {
    const compA = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: compA.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    const created = await request(app).post('/api/stock/assemblies').set(auth()).send({
      date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
      warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [{ item_id: compA.id, quantity: 10, weight: 100, warehouse_id: warehouse.id }],
    });
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(10);

    // Component's own price changed since the assembly was created.
    await compA.update({ purchase_price: 20 });
    const res = await request(app).put(`/api/stock/assemblies/${created.body.id}`).set(auth()).send({
      date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
      warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [{ item_id: compA.id, quantity: 10, weight: 100, warehouse_id: warehouse.id }],
    });
    expect(res.status).toBe(200);
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(20);
  });
});

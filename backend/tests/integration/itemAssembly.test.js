const request = require('supertest');
const express = require('express');
const { sequelize, Item, Stock, StockMovement, ItemAssemblyComponent } = require('../../models');
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

  test('a negative component weight reduces the assembled item cost', async () => {
    const compA = await makeItem({ purchase_price: 10 });
    const compB = await makeItem({ purchase_price: 20 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: compA.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });
    await Stock.create({ item_id: compB.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    // 100kg @10 = 1000, minus 10kg @20 = 200 -> 800 over 100kg = 8/kg.
    const res = await request(app).post('/api/stock/assemblies').set(auth()).send({
      date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
      warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [
        { item_id: compA.id, quantity: 10, weight: 100, warehouse_id: warehouse.id },
        { item_id: compB.id, quantity: 1, weight: -10, warehouse_id: warehouse.id },
      ],
    });
    expect(res.status).toBe(201);
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(8);
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


describe('item assembly - extra expenses line', () => {
  const body = (assembled, comp, extra = []) => ({
    date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
    warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
    components: [{ item_id: comp.id, quantity: 10, weight: 100, warehouse_id: warehouse.id }, ...extra],
  });

  test('quantity x price is added to the cost without touching stock or the produced quantity', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: comp.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    // 100kg @10 = 1000, plus 2 x 150 = 300 of extra expenses -> 1300 over 100kg = 13/kg.
    const res = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, [{ is_expense: true, quantity: 2, price: 150 }]));
    expect(res.status).toBe(201);
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(13);

    // Only the real component and the output moved: no movement for the expense line.
    const movements = await StockMovement.findAll({ where: { movement_type: 'تركيب' } });
    expect(movements).toHaveLength(2);
    const compStock = await Stock.findOne({ where: { item_id: comp.id, warehouse_id: warehouse.id } });
    expect(Number(compStock.weight)).toBe(0);
    const outStock = await Stock.findOne({ where: { item_id: assembled.id, warehouse_id: warehouse.id } });
    expect(Number(outStock.weight)).toBe(100);
    expect(Number(outStock.quantity)).toBe(10);

    const rows = await ItemAssemblyComponent.findAll({ where: { assembly_id: res.body.id } });
    const expense = rows.find(r => r.is_expense);
    expect(expense.item_id).toBeNull();
    expect(Number(expense.quantity)).toBe(2);
    expect(Number(expense.price)).toBe(150);
  });

  test('editing re-prices with the new expense, and deleting reverses only the stock', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: comp.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    const created = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, [{ is_expense: true, quantity: 2, price: 150 }]));
    expect(created.status).toBe(201);

    // 1000 + 1 x 500 = 1500 over 100kg = 15/kg
    const edited = await request(app).put('/api/stock/assemblies/' + created.body.id).set(auth()).send(body(assembled, comp, [{ is_expense: true, quantity: 1, price: 500 }]));
    expect(edited.status).toBe(200);
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(15);
    const rows = await ItemAssemblyComponent.findAll({ where: { assembly_id: created.body.id } });
    expect(rows.filter(r => r.is_expense)).toHaveLength(1);
    expect(Number((await Stock.findOne({ where: { item_id: comp.id, warehouse_id: warehouse.id } })).weight)).toBe(0);

    const del = await request(app).delete('/api/stock/assemblies/' + created.body.id).set(auth());
    expect(del.status).toBe(200);
    expect(Number((await Stock.findOne({ where: { item_id: comp.id, warehouse_id: warehouse.id } })).weight)).toBe(100);
    expect(await ItemAssemblyComponent.count({ where: { assembly_id: created.body.id } })).toBe(0);
  });

  test('an expense line without a quantity and price is refused', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: comp.id, warehouse_id: warehouse.id, quantity: 100, weight: 100 });

    const res = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, [{ is_expense: true, quantity: 2, price: 0 }]));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/المصاريف/);
    // refused before anything was consumed
    expect(Number((await Stock.findOne({ where: { item_id: comp.id, warehouse_id: warehouse.id } })).weight)).toBe(100);
  });
});


describe('item assembly - components may be issued before they are received', () => {
  const body = (assembled, comp, qty, weight) => ({
    date: '2026-01-01', assembled_item_id: assembled.id, assembled_qty: 10, assembled_weight: 100,
    warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
    components: [{ item_id: comp.id, quantity: qty, weight, warehouse_id: warehouse.id }],
  });
  const stockOf = async (item) => Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });

  test('assembling more than the balance succeeds and leaves a negative kg and count balance', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });
    await Stock.create({ item_id: comp.id, warehouse_id: warehouse.id, quantity: 4, weight: 30 });

    const res = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, 10, 100));
    expect(res.status).toBe(201);
    const stock = await stockOf(comp);
    expect(Number(stock.weight)).toBe(-70);
    expect(Number(stock.quantity)).toBe(-6);
    // pricing is unaffected by the shortage: 100kg @10 over 100kg
    expect(Number((await Item.findByPk(assembled.id)).purchase_price)).toBe(10);
  });

  test('a component with no stock record at all can still be issued', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });

    const res = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, 10, 100));
    expect(res.status).toBe(201);
    const stock = await stockOf(comp);
    expect(Number(stock.weight)).toBe(-100);
    expect(Number(stock.quantity)).toBe(-10);
  });

  test('receiving the stock afterwards brings the balance back, and an edit or delete stays consistent', async () => {
    const comp = await makeItem({ purchase_price: 10 });
    const assembled = await makeItem({ purchase_price: 0 });

    const created = await request(app).post('/api/stock/assemblies').set(auth()).send(body(assembled, comp, 10, 100));
    expect(created.status).toBe(201);
    // the late receipt of 150kg / 15
    const s = await stockOf(comp);
    await s.update({ weight: Number(s.weight) + 150, quantity: Number(s.quantity) + 15 });

    // edit down to 60kg / 6 : the old 100 is given back first, then 60 is issued
    const edited = await request(app).put('/api/stock/assemblies/' + created.body.id).set(auth()).send(body(assembled, comp, 6, 60));
    expect(edited.status).toBe(200);
    expect(Number((await stockOf(comp)).weight)).toBe(90);
    expect(Number((await stockOf(comp)).quantity)).toBe(9);

    const del = await request(app).delete('/api/stock/assemblies/' + created.body.id).set(auth());
    expect(del.status).toBe(200);
    expect(Number((await stockOf(comp)).weight)).toBe(150);
  });
});

// What the screens read to warn about stock, and the price offered on a new sales invoice line.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, Stock } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer } = require('../helpers/fixtures');

const SECRET = process.env.JWT_SECRET || 'secret';
let adminT, wh, item, customer;
const get = (url, t = adminT) => request(app).get(url).set({ Authorization: `Bearer ${t}` });
const post = (url, body) => request(app).post(url).set({ Authorization: `Bearer ${adminT}` }).send(body);
const userWith = async (permissions) => jwt.sign({ id: (await User.create({ username: `u${Math.random()}`, password: 'x', role: 'user', permissions })).id }, SECRET);

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  adminT = jwt.sign({ id: admin.id, role: admin.role }, SECRET);
  wh = await makeWarehouse();
  item = await makeItem({ purchase_price: 10, sale_price: 0 });
  customer = await makeCustomer();
  await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 100, weight: 1000 });
});

const sale = async (price, date, { post: doPost = true, tax = 14 } = {}) => {
  const inv = (await post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: wh.id, date, tax_rate: tax, items: [{ item_id: item.id, quantity: 1, weight: 10, price }] })).body;
  if (doPost) expect((await post(`/api/sales-invoices/${inv.id}/post`, {})).status).toBe(200);
  return inv;
};

describe('GET /api/sales-invoices/last-price/:itemId', () => {
  const lastPrice = async () => (await get(`/api/sales-invoices/last-price/${item.id}`)).body.price;

  test('nothing sold yet: no price (and never the cost)', async () => {
    expect(await lastPrice()).toBeNull();
  });

  test('the price on the latest posted invoice, before tax, by invoice date; drafts do not count', async () => {
    await sale(20, '2026-03-10');
    expect(await lastPrice()).toBe(20);          // not 22.80, the tax-inclusive figure stored on the item
    await sale(18, '2026-03-01');                // older date, posted later
    expect(await lastPrice()).toBe(20);
    await sale(99, '2026-03-20', { post: false });
    expect(await lastPrice()).toBe(20);
    await sale(25, '2026-03-15');
    expect(await lastPrice()).toBe(25);
  });

  test('needs the sales invoices permission', async () => {
    expect((await get(`/api/sales-invoices/last-price/${item.id}`, await userWith({ sales_invoices: ['view'] }))).status).toBe(200);
    expect((await get(`/api/sales-invoices/last-price/${item.id}`, await userWith({ stock: ['view'] }))).status).toBe(403);
  });
});

describe('balances for the warnings', () => {
  const CASES = [['/api/delivery-notes/stock-balances', 'delivery_notes'], ['/api/returns/purchase/stock-balances', 'purchase_invoices'], ['/api/stock/balances', 'stock']];

  test('each screen reads them with its own permission, no other one needed', async () => {
    for (const [url, module] of CASES) {
      const res = await get(url, await userWith({ [module]: ['view'] }));
      expect([url, res.status]).toEqual([url, 200]);
      const row = res.body.find(r => r.item_id === item.id && r.warehouse_id === wh.id);
      expect([url, Number(row.weight), row.Item.name]).toEqual([url, 1000, item.name]);
      expect([url, (await get(url, await userWith({ expenses: ['view'] }))).status]).toEqual([url, 403]);
    }
  });
});

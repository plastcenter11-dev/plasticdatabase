// A return linked to an invoice cannot give back more than the invoice sold.

const request = require('supertest');
const app = require('../../app');
const models = require('../../models');
const { sequelize, SalesReturn, PurchaseReturn, Stock, StockMovement } = models;
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

let token, warehouse, item, other, customer, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (url, body) => request(app).post(url).set(auth()).send(body);

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  other = await makeItem({ name: 'صنف آخر' });
  customer = await makeCustomer();
  supplier = await makeSupplier();
  for (const it of [item, other]) {
    await Stock.create({ item_id: it.id, warehouse_id: warehouse.id, quantity: 100, weight: 1000 });
    await StockMovement.create({ item_id: it.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: 100, weight: 1000, date: '2026-01-01', description: 'رصيد افتتاحي' });
  }
});

// a posted sales invoice of 100 kg
const postedSale = async () => {
  const inv = (await post('/api/sales-invoices', {
    customer_id: customer.id, warehouse_id: warehouse.id, invoice_no: `SI-${Math.random()}`, date: '2026-03-01',
    subtotal: 1000, discount: 0, tax_rate: 0, tax_amount: 0, total: 1000, paid: 0, remaining: 1000,
    items: [{ item_id: item.id, quantity: 4, weight: 100, price: 10, discount: 0, total: 1000 }],
  })).body;
  await post(`/api/sales-invoices/${inv.id}/post`, {});
  return inv;
};
const postedPurchase = async () => {
  const inv = (await post('/api/purchase-invoices', {
    supplier_id: supplier.id, warehouse_id: warehouse.id, invoice_no: `PI-${Math.random()}`, date: '2026-03-01',
    subtotal: 1000, discount: 0, tax_rate: 0, tax_amount: 0, total: 1000, paid: 0, remaining: 1000,
    items: [{ item_id: item.id, quantity: 4, weight: 100, price: 10, discount: 0, total: 1000 }],
  })).body;
  await post(`/api/purchase-invoices/${inv.id}/post`, {});
  return inv;
};
const salesReturn = (inv, weight, o = {}) => post('/api/returns/sales', {
  customer_id: customer.id, invoice_id: inv.id, warehouse_id: warehouse.id, date: '2026-03-05',
  total: weight * 10, items: [{ item_id: item.id, quantity: 0, weight, price: 10, discount: 0, total: weight * 10 }], ...o,
});
const purchaseReturn = (inv, weight, o = {}) => post('/api/returns/purchase', {
  supplier_id: supplier.id, invoice_id: inv.id, warehouse_id: warehouse.id, date: '2026-03-05',
  total: weight * 10, items: [{ item_id: item.id, quantity: 0, weight, price: 10, discount: 0, total: weight * 10 }], ...o,
});

describe('sales returns linked to an invoice', () => {
  test('more than the invoice sold is refused and changes nothing', async () => {
    const inv = await postedSale();
    const res = await salesReturn(inv, 150);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('أكبر من المتبقي');
    expect(await SalesReturn.count()).toBe(0);
  });

  test('what is left after an earlier return is the limit', async () => {
    const inv = await postedSale();
    expect((await salesReturn(inv, 60)).status).toBe(201);
    expect((await salesReturn(inv, 50)).status).toBe(400); // only 40 kg left
    expect((await salesReturn(inv, 40)).status).toBe(201); // exactly what is left
    expect((await salesReturn(inv, 1)).status).toBe(400);  // nothing left
    expect(await SalesReturn.count()).toBe(2);
  });

  test('an item that is not on the invoice is refused', async () => {
    const inv = await postedSale();
    const res = await salesReturn(inv, 10, { items: [{ item_id: other.id, quantity: 0, weight: 10, price: 10, discount: 0, total: 100 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('غير موجود في الفاتورة');
  });

  test('a return with no invoice is not limited', async () => {
    const res = await post('/api/returns/sales', {
      customer_id: customer.id, warehouse_id: warehouse.id, date: '2026-03-05', total: 5000,
      items: [{ item_id: item.id, quantity: 0, weight: 500, price: 10, discount: 0, total: 5000 }],
    });
    expect(res.status).toBe(201);
  });
});

describe('purchase returns linked to an invoice', () => {
  test('more than the invoice bought is refused; the remainder is allowed', async () => {
    const inv = await postedPurchase();
    expect((await purchaseReturn(inv, 150)).status).toBe(400);
    expect((await purchaseReturn(inv, 70)).status).toBe(201);
    expect((await purchaseReturn(inv, 31)).status).toBe(400);
    expect((await purchaseReturn(inv, 30)).status).toBe(201);
    expect(await PurchaseReturn.count()).toBe(2);
  });
});

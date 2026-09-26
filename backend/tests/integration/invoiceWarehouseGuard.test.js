const request = require('supertest');
const express = require('express');
const { sequelize, Stock, PurchaseInvoice, SalesInvoice } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeSupplier, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));

let token, warehouse, stockable, service, supplier, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  stockable = await makeItem({ is_stockable: true });
  service = await makeItem({ is_stockable: false });
  supplier = await makeSupplier();
  customer = await makeCustomer();
  await Stock.create({ item_id: stockable.id, warehouse_id: warehouse.id, quantity: 100, weight: 1000 });
});

const line = (item) => [{ item_id: item.id, quantity: 10, weight: 50, price: 10, discount: 0, total: 500 }];

describe('posting an invoice without a warehouse', () => {
  test('purchase: refused when it has stockable items, and stays a draft', async () => {
    const created = await request(app).post('/api/purchase-invoices').set(auth()).send({
      supplier_id: supplier.id, invoice_no: 'PI-NOWH-1', date: '2026-03-01', subtotal: 500, total: 500, items: line(stockable),
    });
    const res = await request(app).post(`/api/purchase-invoices/${created.body.id}/post`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/المخزن/);
    expect((await PurchaseInvoice.findByPk(created.body.id)).status).toBe('draft');
  });

  test('purchase: allowed when every line is a non-stock item (service/fee)', async () => {
    const created = await request(app).post('/api/purchase-invoices').set(auth()).send({
      supplier_id: supplier.id, invoice_no: 'PI-NOWH-2', date: '2026-03-01', subtotal: 500, total: 500, items: line(service),
    });
    const res = await request(app).post(`/api/purchase-invoices/${created.body.id}/post`).set(auth());
    expect(res.status).toBe(200);
  });

  test('purchase: posting with a warehouse still adds the stock', async () => {
    const created = await request(app).post('/api/purchase-invoices').set(auth()).send({
      supplier_id: supplier.id, warehouse_id: warehouse.id, invoice_no: 'PI-WH-1', date: '2026-03-01', subtotal: 500, total: 500, items: line(stockable),
    });
    const res = await request(app).post(`/api/purchase-invoices/${created.body.id}/post`).set(auth());
    expect(res.status).toBe(200);
    const stock = await Stock.findOne({ where: { item_id: stockable.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(1050);
  });

  test('sales: refused when it has stockable items, and stays a draft', async () => {
    const created = await request(app).post('/api/sales-invoices').set(auth()).send({
      customer_id: customer.id, invoice_no: 'SI-NOWH-1', date: '2026-03-01', subtotal: 500, total: 500, items: line(stockable),
    });
    const res = await request(app).post(`/api/sales-invoices/${created.body.id}/post`).set(auth());
    expect(res.status).toBe(400);
    expect((await SalesInvoice.findByPk(created.body.id)).status).toBe('draft');
    const stock = await Stock.findOne({ where: { item_id: stockable.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(1000);
  });
});

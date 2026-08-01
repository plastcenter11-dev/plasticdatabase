const request = require('supertest');
const express = require('express');
const { sequelize, Stock, StockMovement, SalesInvoice, SalesInvoiceItem, PurchaseInvoice, PurchaseInvoiceItem, DeliveryNote, Item, Warehouse } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));

let token, warehouse, item, customer, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
  supplier = await makeSupplier();
});

async function runCycle() {
  const pRes = await request(app).post('/api/purchase-invoices').set(auth()).send({
    supplier_id: supplier.id, warehouse_id: warehouse.id,
    invoice_no: `DI-PI-${Date.now()}`, date: '2026-03-15',
    subtotal: 1000, discount: 0, tax_rate: 0, tax_amount: 0, total: 1000, paid: 0, remaining: 1000,
    items: [{ item_id: item.id, quantity: 20, weight: 200, price: 50, discount: 0, total: 1000 }],
  });
  await request(app).post(`/api/purchase-invoices/${pRes.body.id}/post`).set(auth());

  const sRes = await request(app).post('/api/sales-invoices').set(auth()).send({
    customer_id: customer.id, warehouse_id: warehouse.id,
    invoice_no: `DI-SI-${Date.now()}`, date: '2026-03-16',
    subtotal: 500, discount: 0, tax_rate: 0, tax_amount: 0, total: 500, paid: 0, remaining: 500,
    items: [{ item_id: item.id, quantity: 5, weight: 50, price: 100, discount: 0, total: 500 }],
  });
  await request(app).post(`/api/sales-invoices/${sRes.body.id}/post`).set(auth());
}

describe('Data integrity checks', () => {
  beforeEach(async () => { await runCycle(); });

  test('stock balance per item/warehouse equals net of stock_movements', async () => {
    const stocks = await Stock.findAll();
    for (const s of stocks) {
      const movements = await StockMovement.findAll({ where: { item_id: s.item_id, warehouse_id: s.warehouse_id } });
      let qty = 0, wt = 0;
      for (const m of movements) {
        const sign = ['فاتورة شراء', 'مرتجع بيع', 'إضافة', 'تحويل داخل'].includes(m.movement_type) ? 1 : -1;
        qty += sign * Number(m.quantity || 0);
        wt += sign * Number(m.weight || 0);
      }
      expect(Number(s.quantity)).toBeCloseTo(qty, 2);
      expect(Number(s.weight)).toBeCloseTo(wt, 2);
    }
  });

  test('no negative quantity or weight in stocks after normal operations', async () => {
    const stocks = await Stock.findAll();
    for (const s of stocks) {
      expect(Number(s.quantity)).toBeGreaterThanOrEqual(0);
      expect(Number(s.weight)).toBeGreaterThanOrEqual(0);
    }
  });

  test('every sales_invoice_items total matches its own price/weight/discount math', async () => {
    const items = await SalesInvoiceItem.findAll();
    for (const i of items) {
      const expected = Number(i.quantity) * Number(i.price) - Number(i.discount || 0);
      expect(Number(i.total)).toBeCloseTo(expected, 2);
    }
  });

  test('every purchase_invoice_items total matches its own price/weight/discount math', async () => {
    const items = await PurchaseInvoiceItem.findAll();
    for (const i of items) {
      const expected = Number(i.quantity) * Number(i.price) - Number(i.discount || 0);
      expect(Number(i.total)).toBeCloseTo(expected, 2);
    }
  });

  test('no orphaned item_id foreign keys in stock_movements', async () => {
    const movements = await StockMovement.findAll();
    for (const m of movements) {
      const it = await Item.findByPk(m.item_id);
      expect(it).not.toBeNull();
      if (m.warehouse_id) {
        const wh = await Warehouse.findByPk(m.warehouse_id);
        expect(wh).not.toBeNull();
      }
    }
  });

  test('no orphaned delivery_note_id on sales invoices', async () => {
    const invoices = await SalesInvoice.findAll({ where: { delivery_note_id: { [require('sequelize').Op.ne]: null } } });
    for (const inv of invoices) {
      const note = await DeliveryNote.findByPk(inv.delivery_note_id);
      expect(note).not.toBeNull();
    }
  });
});

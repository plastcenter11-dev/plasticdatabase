const request = require('supertest');
const express = require('express');
const { sequelize, Customer, Supplier, Warehouse, Employee, SalesInvoice, PurchaseInvoice, Stock } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/customers', require('../../routes/customers'));
app.use('/api/suppliers', require('../../routes/suppliers'));
app.use('/api/warehouses', require('../../routes/warehouses'));
app.use('/api', require('../../routes/settings'));

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => { await truncateAll(); token = await makeAuthToken(); });

describe('DELETE /api/customers/:id', () => {
  test('a customer with an invoice cannot be deleted and keeps the invoice linked', async () => {
    const c = await makeCustomer();
    const inv = await SalesInvoice.create({ invoice_no: 'SI-T1', date: '2026-03-01', customer_id: c.id, status: 'posted', total: 100, subtotal: 100, remaining: 100 });
    const res = await request(app).delete(`/api/customers/${c.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Customer.findByPk(c.id)).not.toBeNull();
    expect((await SalesInvoice.findByPk(inv.id)).customer_id).toBe(c.id);
  });

  test('a customer that was never used is deleted', async () => {
    const c = await makeCustomer();
    const res = await request(app).delete(`/api/customers/${c.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(await Customer.findByPk(c.id)).toBeNull();
  });
});

describe('DELETE /api/suppliers/:id', () => {
  test('a supplier with an invoice cannot be deleted', async () => {
    const s = await makeSupplier();
    await PurchaseInvoice.create({ invoice_no: 'PI-T1', date: '2026-03-01', supplier_id: s.id, status: 'posted', total: 100, subtotal: 100, remaining: 100 });
    const res = await request(app).delete(`/api/suppliers/${s.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Supplier.findByPk(s.id)).not.toBeNull();
  });

  test('a supplier that was never used is deleted', async () => {
    const s = await makeSupplier();
    const res = await request(app).delete(`/api/suppliers/${s.id}`).set(auth());
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/warehouses/:id', () => {
  test('a warehouse that holds stock cannot be deleted', async () => {
    const w = await makeWarehouse();
    const item = await makeItem();
    await Stock.create({ item_id: item.id, warehouse_id: w.id, quantity: 5, weight: 50 });
    const res = await request(app).delete(`/api/warehouses/${w.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Warehouse.findByPk(w.id)).not.toBeNull();
  });

  test('an unused warehouse is deleted', async () => {
    const w = await makeWarehouse();
    const res = await request(app).delete(`/api/warehouses/${w.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(await Warehouse.findByPk(w.id)).toBeNull();
  });
});

describe('DELETE /api/employees/:id', () => {
  test('an employee tied to an invoice cannot be deleted', async () => {
    const e = await Employee.create({ name: 'مندوب', commission_rate: 1 });
    const c = await makeCustomer();
    await SalesInvoice.create({ invoice_no: 'SI-T2', date: '2026-03-01', customer_id: c.id, employee_id: e.id, status: 'posted', total: 10, subtotal: 10, remaining: 10 });
    const res = await request(app).delete(`/api/employees/${e.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Employee.findByPk(e.id)).not.toBeNull();
  });

  test('an employee with no invoices is deleted', async () => {
    const e = await Employee.create({ name: 'مندوب 2', commission_rate: 1 });
    const res = await request(app).delete(`/api/employees/${e.id}`).set(auth());
    expect(res.status).toBe(200);
  });
});

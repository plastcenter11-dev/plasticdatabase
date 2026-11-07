// Cash discounts are listed apart from collections and payments and move the balance like them.

const request = require('supertest');
const express = require('express');
const { sequelize, Customer, Supplier } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/finance', require('../../routes/finance'));

let token, customer, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  customer = await makeCustomer();
  supplier = await makeSupplier();
});

const post = (url, body) => request(app).post(url).set(auth()).send({ date: '2026-03-05', ...body });

describe('cash discounts', () => {
  test('customer: a discount is kept out of the collections list, shown in the discount list, and lowers the balance', async () => {
    await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 300, payment_method: 'نقدي' });
    const d = await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 50, payment_method: 'خصم نقدي' });
    expect(d.status).toBe(201);
    const normal = (await request(app).get('/api/finance/cash-receipts').set(auth())).body;
    const discounts = (await request(app).get('/api/finance/cash-receipts?kind=discount').set(auth())).body;
    expect(normal.map(r => Number(r.amount))).toEqual([300]);
    expect(discounts.map(r => Number(r.amount))).toEqual([50]);
    expect(Number((await Customer.findByPk(customer.id)).balance)).toBe(-350);
  });

  test('supplier: same separation, and deleting a discount restores the balance', async () => {
    await post('/api/finance/cash-payments', { supplier_id: supplier.id, amount: 200, payment_method: 'نقدي' });
    const d = (await post('/api/finance/cash-payments', { supplier_id: supplier.id, amount: 40, payment_method: 'خصم نقدي' })).body;
    expect((await request(app).get('/api/finance/cash-payments').set(auth())).body.map(p => Number(p.amount))).toEqual([200]);
    expect((await request(app).get('/api/finance/cash-payments?kind=discount').set(auth())).body.map(p => Number(p.amount))).toEqual([40]);
    expect(Number((await Supplier.findByPk(supplier.id)).balance)).toBe(-240);
    await request(app).delete(`/api/finance/cash-payments/${d.id}`).set(auth());
    expect(Number((await Supplier.findByPk(supplier.id)).balance)).toBe(-200);
  });
});

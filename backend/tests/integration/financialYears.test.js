const request = require('supertest');
const express = require('express');
const { sequelize, FinancialYear, Customer, OpeningBalance } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api', require('../../routes/settings'));
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
});

describe('POST /api/financial-years/:id/close', () => {
  test('does not create OpeningBalance snapshot rows (would double-count the running balance)', async () => {
    const customer = await makeCustomer({ balance: 500 });
    const y1 = await FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true });
    const y2 = await FinancialYear.create({ name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_active: false });

    const res = await request(app).post(`/api/financial-years/${y1.id}/close`).set(auth()).send({ next_year_id: y2.id });
    expect(res.status).toBe(200);

    const openingRows = await OpeningBalance.findAll({ where: { party_type: 'customer', party_id: customer.id } });
    expect(openingRows.length).toBe(0);

    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(500); // untouched by closing - no snapshot inserted
  });

  test('marks the old year closed/inactive and the new year active', async () => {
    const y1 = await FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true });
    const y2 = await FinancialYear.create({ name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_active: false });

    await request(app).post(`/api/financial-years/${y1.id}/close`).set(auth()).send({ next_year_id: y2.id });

    const closed = await FinancialYear.findByPk(y1.id);
    const active = await FinancialYear.findByPk(y2.id);
    expect(closed.is_closed).toBe(true);
    expect(closed.is_active).toBe(false);
    expect(active.is_active).toBe(true);
  });
});

describe('closed-year locking on financial documents', () => {
  test('rejects creating a sales invoice dated inside a closed year', async () => {
    await FinancialYear.create({ name: '2020', start_date: '2020-01-01', end_date: '2020-12-31', is_active: false, is_closed: true });
    const customer = await makeCustomer();

    const res = await request(app).post('/api/sales-invoices').set(auth()).send({
      customer_id: customer.id, date: '2020-06-15', items: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/مقفولة/);
  });

  test('allows creating a sales invoice dated outside any closed year', async () => {
    await FinancialYear.create({ name: '2020', start_date: '2020-01-01', end_date: '2020-12-31', is_active: false, is_closed: true });
    const customer = await makeCustomer();

    const res = await request(app).post('/api/sales-invoices').set(auth()).send({
      customer_id: customer.id, date: '2026-06-15', items: [],
    });
    expect(res.status).toBe(201);
  });

  test('reopen removes the lock so a document dated in that year can be created again', async () => {
    const y = await FinancialYear.create({ name: '2020', start_date: '2020-01-01', end_date: '2020-12-31', is_active: false, is_closed: true });
    const customer = await makeCustomer();

    await request(app).post(`/api/financial-years/${y.id}/reopen`).set(auth());

    const res = await request(app).post('/api/sales-invoices').set(auth()).send({
      customer_id: customer.id, date: '2020-06-15', items: [],
    });
    expect(res.status).toBe(201);
  });
});

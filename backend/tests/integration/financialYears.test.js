const request = require('supertest');
const express = require('express');
const { sequelize, FinancialYear, Customer, OpeningBalance } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
// this mini app has no auth middleware: close / reopen are admin-only now, so the request is made by an admin
app.use((req, res, next) => { req.user = { id: 0, role: 'admin', permissions: {} }; next(); });
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

describe('closing a year locks every earlier date too', () => {
  const close2025 = () => FinancialYear.create({ name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', is_active: false, is_closed: true });
  const invoiceOn = (customer, date) => request(app).post('/api/sales-invoices').set(auth()).send({ customer_id: customer.id, date, items: [] });

  test('a document dated BEFORE the closed year (never defined, or mistyped) is refused as well, with its own message', async () => {
    await close2025();
    const customer = await makeCustomer();
    const before = await invoiceOn(customer, '2020-05-05');
    expect(before.status).toBe(400);
    expect(before.body.error).toMatch(/مقفولة/);
    const inside = await invoiceOn(customer, '2025-06-15');
    expect(inside.status).toBe(400);
    expect(inside.body.error).toMatch(/"2025"/);
    expect((await invoiceOn(customer, '2026-03-02')).status).toBe(201);
    // a mistyped year such as 0001 is refused as a date long before the lock is asked, so the lock itself is checked directly
    const { closedYearError } = require('../../utils/financialYear');
    expect(await closedYearError('0001-02-21')).toMatch(/مقفولة/);
  });

  test('re-opening the year unlocks the earlier dates again', async () => {
    const y = await close2025();
    const customer = await makeCustomer();
    expect((await invoiceOn(customer, '2020-05-05')).status).toBe(400);
    await request(app).post(`/api/financial-years/${y.id}/reopen`).set(auth());
    expect((await invoiceOn(customer, '2020-05-05')).status).toBe(201);
  });
});

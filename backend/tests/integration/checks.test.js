const request = require('supertest');
const express = require('express');
const { sequelize, Customer, FinancialYear } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/finance', require('../../routes/finance'));

let token, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  customer = await makeCustomer({ balance: 1000 });
});

describe('POST /api/finance/checks', () => {
  test('a pending check decrements the party balance immediately', async () => {
    const res = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    expect(res.status).toBe(201);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(700);
  });

  test('a bounced check has zero balance effect', async () => {
    const res = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'bounced',
    });
    expect(res.status).toBe(201);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(1000);
  });
});

describe('PUT /api/finance/checks/:id — status transitions', () => {
  test('pending -> bounced adds the amount back to the balance', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    let cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(700);

    const res = await request(app).put(`/api/finance/checks/${created.body.id}`).set(auth()).send({ status: 'bounced' });
    expect(res.status).toBe(200);
    cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(1000);
  });

  test('bounced -> pending removes the amount from the balance again', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'bounced',
    });
    const res = await request(app).put(`/api/finance/checks/${created.body.id}`).set(auth()).send({ status: 'pending' });
    expect(res.status).toBe(200);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(700);
  });

  test('bounced -> bounced is a no-op on balance', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'bounced',
    });
    const res = await request(app).put(`/api/finance/checks/${created.body.id}`).set(auth()).send({ status: 'bounced', amount: 999 });
    expect(res.status).toBe(200);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(1000);
  });
});

describe('DELETE /api/finance/checks/:id', () => {
  test('reverses the balance effect before deleting', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-01-01', due_date: '2026-02-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    const res = await request(app).delete(`/api/finance/checks/${created.body.id}`).set(auth());
    expect(res.status).toBe(200);
    const cust = await Customer.findByPk(customer.id);
    expect(Number(cust.balance)).toBe(1000);
  });
});

describe('closed-year locking on checks', () => {
  test('rejects creating a check dated inside a closed year', async () => {
    await FinancialYear.create({ name: '2020', start_date: '2020-01-01', end_date: '2020-12-31', is_active: false, is_closed: true });
    const res = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2020-06-01', due_date: '2020-07-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    expect(res.status).toBe(400);
  });

  test('PUT is blocked if the check current date is in a closed year, even when the request only changes status', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-06-01', due_date: '2026-07-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    await FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: false, is_closed: true });

    const res = await request(app).put(`/api/finance/checks/${created.body.id}`).set(auth()).send({ status: 'bounced' });
    expect(res.status).toBe(400);
  });

  test('PUT is blocked if the check is dated in an open year but the request moves it into a closed year', async () => {
    const created = await request(app).post('/api/finance/checks').set(auth()).send({
      check_no: 'CHK-1', date: '2026-06-01', due_date: '2026-07-01',
      party_type: 'customer', party_id: customer.id, amount: 300, status: 'pending',
    });
    await FinancialYear.create({ name: '2020', start_date: '2020-01-01', end_date: '2020-12-31', is_active: false, is_closed: true });

    const res = await request(app).put(`/api/finance/checks/${created.body.id}`).set(auth()).send({ date: '2020-06-01' });
    expect(res.status).toBe(400);
  });
});

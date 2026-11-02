// "Customers who stopped buying but still owe": GET /api/customers/silent

const request = require('supertest');
const express = require('express');
const { sequelize, OpeningBalance, SalesInvoice, CashReceipt } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeCustomer, makeWarehouse } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/customers', require('../../routes/customers'));

let warehouse;
beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => { await truncateAll(); warehouse = await makeWarehouse(); });

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const invoice = (customer, date, total, status = 'posted') => SalesInvoice.create({
  invoice_no: `SI-${Date.now()}-${Math.random()}`, date, status, customer_id: customer.id, warehouse_id: warehouse.id, subtotal: total, total, paid: 0, remaining: total,
});
const silent = async (query = '') => (await request(app).get(`/api/customers/silent${query}`)).body;

describe('GET /api/customers/silent', () => {
  test('lists a customer who owes and has not bought for more than the days given, with the facts', async () => {
    const karina = await makeCustomer({ name: 'كارينا', phone: '0100' });
    await invoice(karina, daysAgo(90), 274000);
    const res = await silent('?days=60');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ name: 'كارينا', phone: '0100', balance: 274000, last_purchase: daysAgo(90), days_silent: 90, last_receipt: null });
    expect(res.total).toBe(274000);
  });

  test('a customer who bought recently is not silent', async () => {
    const active = await makeCustomer({ name: 'نشط' });
    await invoice(active, daysAgo(10), 5000);
    expect((await silent('?days=60')).rows).toHaveLength(0);
    // the same customer shows up once the threshold is shorter than the silence
    expect((await silent('?days=7')).rows.map(r => r.name)).toEqual(['نشط']);
  });

  test('the boundary: exactly the number of days counts as silent', async () => {
    const edge = await makeCustomer({ name: 'حد' });
    await invoice(edge, daysAgo(60), 1000);
    expect((await silent('?days=60')).rows).toHaveLength(1);
    expect((await silent('?days=61')).rows).toHaveLength(0);
  });

  test('a customer who owes nothing is not listed, however long silent', async () => {
    const paid = await makeCustomer({ name: 'سدد' });
    await invoice(paid, daysAgo(200), 1000);
    await CashReceipt.create({ receipt_no: 'CR-T1', date: daysAgo(190), amount: 1000, customer_id: paid.id, payment_method: 'نقدي' });
    expect((await silent('?days=60')).rows).toHaveLength(0);
  });

  test('a draft invoice is not a purchase; the last posted one decides', async () => {
    const c = await makeCustomer({ name: 'مسودة' });
    await invoice(c, daysAgo(100), 3000);
    await invoice(c, daysAgo(5), 9000, 'draft');
    const rows = (await silent('?days=60')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].last_purchase).toBe(daysAgo(100));
    expect(rows[0].balance).toBe(3000); // the draft is not counted in the balance either
  });

  test('the last payment date is reported', async () => {
    const c = await makeCustomer({ name: 'دفع' });
    await invoice(c, daysAgo(120), 5000);
    await CashReceipt.create({ receipt_no: 'CR-T2', date: daysAgo(70), amount: 1000, customer_id: c.id, payment_method: 'نقدي' });
    const row = (await silent('?days=60')).rows[0];
    expect(row.balance).toBe(4000);
    expect(row.last_receipt).toBe(daysAgo(70));
  });

  test('a customer with only an opening balance (never bought) is listed with no purchase date', async () => {
    const c = await makeCustomer({ name: 'افتتاحي' });
    await OpeningBalance.create({ party_type: 'customer', party_id: c.id, debit: 800, credit: 0, date: daysAgo(300) });
    const row = (await silent('?days=60')).rows[0];
    expect(row).toMatchObject({ name: 'افتتاحي', balance: 800, last_purchase: null, days_silent: null });
  });

  test('the minimum balance filters small debts, and the biggest debt comes first', async () => {
    const small = await makeCustomer({ name: 'صغير' });
    const big = await makeCustomer({ name: 'كبير' });
    await invoice(small, daysAgo(100), 50);
    await invoice(big, daysAgo(100), 9000);
    expect((await silent('?days=60')).rows.map(r => r.name)).toEqual(['كبير', 'صغير']);
    const res = await silent('?days=60&min_balance=100');
    expect(res.rows.map(r => r.name)).toEqual(['كبير']);
    expect(res.total).toBe(9000);
  });

  test('defaults: 60 days and a balance of at least 1; nothing to report is an empty list', async () => {
    expect(await silent()).toMatchObject({ days: 60, min_balance: 1, total: 0, rows: [] });
  });
});

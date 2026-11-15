// Cash payments can go back to a customer (a refund) as well as to a supplier.

const request = require('supertest');
const app = require('../../app');
const { sequelize, Customer, Supplier, CashPayment } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer, makeSupplier } = require('../helpers/fixtures');
const models = require('../../models');
const { checkInvariants } = require('../../utils/invariants');

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const pay = (body) => request(app).post('/api/finance/cash-payments').set(auth()).send({ date: '2026-05-01', amount: 100, ...body });
const balanceOf = async (Model, id) => Number((await Model.findByPk(id)).balance);

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => { await truncateAll(); token = await makeAuthToken(); });

describe('cash payment back to a customer', () => {
  test('raises what the customer owes and shows on the statement as a debit', async () => {
    const c = await makeCustomer();
    await request(app).post('/api/finance/cash-receipts').set(auth()).send({ customer_id: c.id, amount: 500, date: '2026-05-01' });
    expect(await balanceOf(Customer, c.id)).toBe(-500);

    const res = await pay({ customer_id: c.id, amount: 200 });
    expect(res.status).toBe(201);
    expect(res.body.payment_no).toMatch(/^CP-/);
    expect(res.body.supplier_id).toBeNull();
    expect(await balanceOf(Customer, c.id)).toBe(-300);

    const st = (await request(app).get(`/api/customers/${c.id}/statement`).set(auth())).body;
    const refund = st.find(m => m.type === 'رد نقدية');
    expect(refund).toMatchObject({ reference: res.body.payment_no, debit: 200, credit: 0 });
    expect(st[st.length - 1].balance).toBe(-300);
    // the customers list computes the balance live from the documents and must agree
    const list = (await request(app).get('/api/customers').set(auth())).body;
    expect(list.find(x => x.id === c.id).balance).toBe(-300);
  });

  test('deleting it puts the balance back', async () => {
    const c = await makeCustomer();
    const res = await pay({ customer_id: c.id, amount: 150 });
    expect(await balanceOf(Customer, c.id)).toBe(150);
    const del = await request(app).delete(`/api/finance/cash-payments/${res.body.id}`).set(auth());
    expect(del.status).toBe(200);
    expect(await balanceOf(Customer, c.id)).toBe(0);
    expect(await CashPayment.count()).toBe(0);
  });

  test('listing includes the customer name, and a supplier payment is unchanged', async () => {
    const c = await makeCustomer({ name: 'عميل الرد' });
    const s = await makeSupplier();
    await pay({ customer_id: c.id });
    await pay({ supplier_id: s.id, amount: 70 });
    expect(await balanceOf(Supplier, s.id)).toBe(-70);
    const list = (await request(app).get('/api/finance/cash-payments').set(auth())).body;
    expect(list.find(p => p.Customer)?.Customer.name).toBe('عميل الرد');
    expect(list.find(p => p.Supplier)?.supplier_id).toBe(s.id);
  });

  test('exactly one of customer or supplier is required', async () => {
    const c = await makeCustomer();
    const s = await makeSupplier();
    expect((await pay({})).status).toBe(400);
    expect((await pay({ customer_id: c.id, supplier_id: s.id })).status).toBe(400);
    expect(await CashPayment.count()).toBe(0);
    expect(await balanceOf(Customer, c.id)).toBe(0);
    expect(await balanceOf(Supplier, s.id)).toBe(0);
  });

  test('a customer with a refund cannot be deleted', async () => {
    const c = await makeCustomer();
    await pay({ customer_id: c.id });
    const res = await request(app).delete(`/api/customers/${c.id}`).set(auth());
    expect(res.status).toBe(400);
    expect(await Customer.findByPk(c.id)).not.toBeNull();
  });

  test('the accounting checks still agree with the balances', async () => {
    const c = await makeCustomer();
    await request(app).post('/api/finance/cash-receipts').set(auth()).send({ customer_id: c.id, amount: 400, date: '2026-05-01' });
    await pay({ customer_id: c.id, amount: 120 });
    const getJson = async (url) => (await request(app).get(url).set(auth())).body;
    const report = await checkInvariants({ models, sequelize, getJson });
    const bad = report.flatMap(r => r.violations).filter(v => v.severity === 'error');
    expect(bad).toEqual([]);
  });
});

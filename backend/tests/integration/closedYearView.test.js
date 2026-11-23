// A closed financial year is also hidden from READING for anyone who is not an admin and has no 'view_closed'
// on the financial-years permission (utils/closedView.js), through the real app. Balances stay right: statements
// and item movements start with a carried-forward line.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const models = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const { sequelize, User, SalesInvoice, PurchaseInvoice, CashReceipt, CashPayment, Check, Expense, StockMovement, FinancialYear, Customer } = models;

const SECRET = process.env.JWT_SECRET || 'secret';
const tokenFor = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET);
const get = (url, t) => request(app).get(url).set({ Authorization: `Bearer ${t}` });

const OLD = '2026-03-01', OLD2 = '2026-04-01', NEW = '2027-02-01';
let adminT, userT, viewerT, customer, supplier, item, wh, oldInv, newInv;

const PERMS = { sales_invoices: ['view'], purchase_invoices: ['view'], cash_receipts: ['view'], cash_payments: ['view'], checks: ['view'], expenses: ['view'], stock: ['view'], customers: ['view'], suppliers: ['view'] };

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  const user = await User.create({ username: 'clerk', password: 'x', role: 'user', permissions: PERMS });
  const viewer = await User.create({ username: 'auditor', password: 'x', role: 'user', permissions: { ...PERMS, financial_years: ['view_closed'] } });
  [adminT, userT, viewerT] = [admin, user, viewer].map(tokenFor);
  customer = await makeCustomer({ balance: 1000 });
  supplier = await makeSupplier();
  item = await makeItem();
  wh = await makeWarehouse();

  // customer: invoice 1000 and receipt 400 in 2026 (closed), invoice 500 and receipt 100 in 2027 -> balance 1000
  oldInv = await SalesInvoice.create({ invoice_no: 'SI-OLD', date: OLD, customer_id: customer.id, status: 'posted', subtotal: 1000, total: 1000, remaining: 1000 });
  newInv = await SalesInvoice.create({ invoice_no: 'SI-NEW', date: NEW, customer_id: customer.id, status: 'posted', subtotal: 500, total: 500, remaining: 500 });
  await CashReceipt.create({ receipt_no: 'CR-OLD', date: OLD2, customer_id: customer.id, amount: 400, payment_method: 'نقدي' });
  await CashReceipt.create({ receipt_no: 'CR-NEW', date: NEW, customer_id: customer.id, amount: 100, payment_method: 'نقدي' });
  // supplier: purchase 800 in 2026, payment 300 in 2027
  await PurchaseInvoice.create({ invoice_no: 'PI-OLD', date: OLD, supplier_id: supplier.id, status: 'posted', subtotal: 800, total: 800, remaining: 800 });
  await CashPayment.create({ payment_no: 'CP-NEW', date: NEW, supplier_id: supplier.id, amount: 300, payment_method: 'نقدي' });
  // stock: +100 and -30 in 2026, -10 in 2027
  const mv = (movement_type, weight, date) => StockMovement.create({ item_id: item.id, warehouse_id: wh.id, movement_type, quantity: 1, weight, date, description: '', reference: '' });
  await mv('إضافة', 100, OLD); await mv('صرف', 30, OLD2); await mv('صرف', 10, NEW);
  await FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: false, is_closed: true });
});

const refs = (rows, key) => rows.map(r => r[key]);

describe('lists', () => {
  test('an admin and a user with view_closed see everything', async () => {
    for (const t of [adminT, viewerT]) {
      const res = await get('/api/sales-invoices', t);
      expect(refs(res.body, 'invoice_no').sort()).toEqual(['SI-NEW', 'SI-OLD']);
      expect((await get('/api/finance/cash-receipts', t)).body.length).toBe(2);
    }
  });

  test('anyone else gets only the open year: plain lists and paged lists (with a right total)', async () => {
    expect(refs((await get('/api/sales-invoices', userT)).body, 'invoice_no')).toEqual(['SI-NEW']);
    const paged = (await get('/api/sales-invoices?page=1&limit=10', userT)).body;
    expect(refs(paged.rows, 'invoice_no')).toEqual(['SI-NEW']);
    expect(paged.total).toBe(1);
    expect(refs((await get('/api/purchase-invoices', userT)).body, 'invoice_no')).toEqual([]);
    expect(refs((await get('/api/finance/cash-receipts', userT)).body, 'receipt_no')).toEqual(['CR-NEW']);
    expect(refs((await get('/api/finance/cash-payments', userT)).body, 'payment_no')).toEqual(['CP-NEW']);
  });

  test('a start date inside the closed year is moved to the first open day', async () => {
    const res = await get('/api/sales-invoices?from=2026-01-01&to=2027-12-31', userT);
    expect(refs(res.body, 'invoice_no')).toEqual(['SI-NEW']);
  });

  test('opening one document of a closed year by its id is refused; an open-year one is fine', async () => {
    expect((await get(`/api/sales-invoices/${oldInv.id}`, userT)).status).toBe(403);
    expect((await get(`/api/sales-invoices/${newInv.id}`, userT)).status).toBe(200);
    expect((await get(`/api/sales-invoices/${oldInv.id}`, viewerT)).status).toBe(200);
    expect((await get(`/api/sales-invoices/${oldInv.id}`, adminT)).status).toBe(200);
  });

  test('the overdue-checks alert still shows an old pending check (a to-do list, not history)', async () => {
    await Check.create({ check_no: 'CH-OLD', date: OLD, due_date: OLD2, party_type: 'customer', party_id: customer.id, amount: 10, status: 'pending' });
    const res = await get('/api/finance/checks/overdue', userT);
    expect(res.status).toBe(200);
    expect(refs(res.body, 'check_no')).toEqual(['CH-OLD']);
    expect((await get('/api/finance/checks', userT)).body.length).toBe(0);   // but the history list hides it
  });

  test('balances are not hidden: the customer list still shows the real balance', async () => {
    const of = async (t) => Number((await get('/api/customers', t)).body.find(c => c.id === customer.id).balance);
    expect(await of(userT)).toBe(1000);
    expect(await of(userT)).toBe(await of(adminT));
  });
});

describe('statements and item movements keep their balances right', () => {
  test('a customer statement starts with a carried-forward line, then the open year, ending on the same balance', async () => {
    const admin = (await get(`/api/customers/${customer.id}/statement`, adminT)).body;
    const user = (await get(`/api/customers/${customer.id}/statement`, userT)).body;
    expect(admin.map(r => r.reference)).toEqual(['SI-OLD', 'CR-OLD', 'SI-NEW', 'CR-NEW']);
    expect(user[0].type).toBe('رصيد مرحّل');
    expect(Number(user[0].balance)).toBe(600);            // 1000 - 400
    expect(user.slice(1).map(r => r.reference)).toEqual(['SI-NEW', 'CR-NEW']);
    expect(Number(user[user.length - 1].balance)).toBe(Number(admin[admin.length - 1].balance));
    expect(JSON.stringify(user)).not.toMatch(/SI-OLD|CR-OLD/);
  });

  test('a supplier statement too', async () => {
    const user = (await get(`/api/suppliers/${supplier.id}/statement`, userT)).body;
    const admin = (await get(`/api/suppliers/${supplier.id}/statement`, adminT)).body;
    expect(user[0].type).toBe('رصيد مرحّل');
    expect(Number(user[0].balance)).toBe(800);
    expect(JSON.stringify(user)).not.toMatch(/PI-OLD/);
    expect(Number(user[user.length - 1].balance)).toBe(Number(admin[admin.length - 1].balance));
  });

  test('item movements start with one carried-forward line per warehouse (100 - 30 = 70), then the open movements', async () => {
    const admin = (await get(`/api/stock/movements/${item.id}`, adminT)).body;
    expect(admin.length).toBe(3);
    const user = (await get(`/api/stock/movements/${item.id}`, userT)).body;
    expect(user.length).toBe(2);
    expect(user[0].movement_type).toBe('إضافة');
    expect(Number(user[0].weight)).toBe(70);
    expect(user[0].description).toMatch(/مرحّل/);
    expect(user[1].movement_type).toBe('صرف');
    expect(Number(user[1].weight)).toBe(10);
    // same arithmetic as the screen: 70 carried - 10 = 60 = 100 - 30 - 10
  });

  test('a user with view_closed gets the plain, complete statement', async () => {
    const rows = (await get(`/api/customers/${customer.id}/statement`, viewerT)).body;
    expect(rows.map(r => r.reference)).toEqual(['SI-OLD', 'CR-OLD', 'SI-NEW', 'CR-NEW']);
  });
});

describe('when nothing is closed, or it is re-opened', () => {
  test('nothing is hidden while no year is closed, and again after a re-open', async () => {
    await FinancialYear.update({ is_closed: false }, { where: {} });
    expect(refs((await get('/api/sales-invoices', userT)).body, 'invoice_no').sort()).toEqual(['SI-NEW', 'SI-OLD']);
    expect((await get(`/api/sales-invoices/${oldInv.id}`, userT)).status).toBe(200);
    const rows = (await get(`/api/customers/${customer.id}/statement`, userT)).body;
    expect(rows.map(r => r.reference)).toEqual(['SI-OLD', 'CR-OLD', 'SI-NEW', 'CR-NEW']);
  });

  test('writing is not touched: the same user can still add to the open year', async () => {
    const u = await User.create({ username: 'cashier', password: 'x', role: 'user', permissions: { cash_receipts: ['view', 'create'] } });
    const res = await request(app).post('/api/finance/cash-receipts').set({ Authorization: `Bearer ${tokenFor(u)}` })
      .send({ customer_id: customer.id, amount: 5, date: NEW, payment_method: 'نقدي' });
    expect(res.status).toBe(201);
    expect(Number((await Customer.findByPk(customer.id)).balance)).toBe(995);
  });
});

describe('closing and re-opening a year is for the admin only', () => {
  const FY = '/api/financial-years';
  const call = (method, url, t, body) => request(app)[method](url).set({ Authorization: `Bearer ${t}` }).send(body || {});
  let managerT, closed, open;
  beforeEach(async () => {
    const manager = await User.create({ username: 'manager', password: 'x', role: 'user', permissions: { financial_years: ['view', 'create', 'edit', 'delete'] } });
    managerT = tokenFor(manager);
    closed = await FinancialYear.findOne({ where: { name: '2026' } });
    open = await FinancialYear.create({ name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_active: true, is_closed: false });
  });

  test('even full rights on the financial years cannot close or re-open a year', async () => {
    expect((await call('post', `${FY}/${open.id}/close`, managerT, { next_year_id: closed.id })).status).toBe(403);
    expect((await call('post', `${FY}/${closed.id}/reopen`, managerT)).status).toBe(403);
    expect((await FinancialYear.findByPk(closed.id)).is_closed).toBe(true);
    expect((await FinancialYear.findByPk(open.id)).is_closed).toBe(false);
  });

  test('the edit route cannot be used to slip round it: no is_closed in the body, no changes to a closed year', async () => {
    expect((await call('put', `${FY}/${closed.id}`, managerT, { is_closed: false })).status).toBe(403);
    expect((await call('put', `${FY}/${closed.id}`, managerT, { end_date: '2026-01-02' })).status).toBe(403);
    const y = await FinancialYear.findByPk(closed.id);
    expect(y.is_closed).toBe(true);
    expect(String(y.end_date)).toBe('2026-12-31');
    // an open year can be renamed, but closing it through the body is ignored
    expect((await call('put', `${FY}/${open.id}`, managerT, { name: '2027 ب', is_closed: true })).status).toBe(200);
    const o = await FinancialYear.findByPk(open.id);
    expect(o.name).toBe('2027 ب');
    expect(o.is_closed).toBe(false);
  });

  test('a closed year cannot be deleted or activated, and a new one is never created closed', async () => {
    expect((await call('delete', `${FY}/${closed.id}`, managerT)).status).toBe(400);
    expect((await call('post', `${FY}/${closed.id}/activate`, managerT)).status).toBe(400);
    expect(await FinancialYear.findByPk(closed.id)).not.toBeNull();
    const made = await call('post', FY, managerT, { name: '2028', start_date: '2028-01-01', end_date: '2028-12-31', is_closed: true, is_active: true });
    expect(made.status).toBe(201);
    expect(made.body.is_closed).toBeFalsy();
    expect(made.body.is_active).toBeFalsy();
  });

  test('the admin can re-open, and view_closed alone gives no power over years', async () => {
    const auditor = await User.create({ username: 'rev', password: 'x', role: 'user', permissions: { financial_years: ['view', 'view_closed'] } });
    expect((await call('post', `${FY}/${closed.id}/reopen`, tokenFor(auditor))).status).toBe(403);
    expect((await call('post', `${FY}/${closed.id}/reopen`, adminT)).status).toBe(200);
    expect((await FinancialYear.findByPk(closed.id)).is_closed).toBe(false);
    expect((await call('post', `${FY}/${open.id}/close`, adminT, { next_year_id: closed.id })).status).toBe(200);
    expect((await FinancialYear.findByPk(open.id)).is_closed).toBe(true);
  });
});

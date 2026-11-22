// Correcting the date and the line prices of a POSTED invoice (utils/postedCorrection.js), through the
// real app. The point of the feature is that nothing posting wrote is left behind: the party's balance,
// the stock movements, the receipt / payment, the delivery note and the item's last price all follow, and
// the accounting invariants still hold afterwards.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const models = require('../../models');
const { checkInvariants } = require('../../utils/invariants');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const { sequelize, User, Stock, StockMovement, CashReceipt, CashPayment, Customer, Supplier, Item, SalesInvoice, SalesInvoiceItem, SalesReturn, PurchaseInvoice, DeliveryNote, FinancialYear } = models;

const SECRET = process.env.JWT_SECRET || 'secret';
const tokenFor = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET);
let admin, adminT, wh, item, customer, supplier;
const as = (t) => ({ Authorization: `Bearer ${t}` });
const post = (url, body, t = adminT) => request(app).post(url).set(as(t)).send(body);

const getJson = async (url) => {
  const res = await request(app).get(url).set(as(adminT));
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}`);
  return res.body;
};
const expectInvariants = async (step) => {
  const results = await checkInvariants({ models, sequelize, getJson });
  const errors = results.flatMap(r => r.violations.filter(v => v.severity === 'error').map(v => `[${r.code}] ${v.message}`));
  if (errors.length) throw new Error(`invariants broken after "${step}":\n  ${errors.join('\n  ')}`);
};

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  adminT = tokenFor(admin);
  wh = await makeWarehouse();
  item = await makeItem({ purchase_price: 10, sale_price: 15 });
  customer = await makeCustomer();
  supplier = await makeSupplier();
  // opening stock, with the movement that explains it (the invariants compare the two)
  await Stock.create({ item_id: item.id, warehouse_id: wh.id, quantity: 100, weight: 1000 });
  await StockMovement.create({ item_id: item.id, warehouse_id: wh.id, movement_type: 'إضافة', quantity: 100, weight: 1000, date: '2026-01-01', description: 'رصيد أول', reference: '' });
});

// 100 kg at 20 = 2000, 14% VAT = 280, total 2280, 100 paid -> 2180 remaining
async function postedSale(overrides = {}) {
  const created = await post('/api/sales-invoices', {
    customer_id: customer.id, warehouse_id: wh.id, date: '2026-03-01', tax_rate: 14, paid: 100,
    items: [{ item_id: item.id, quantity: 5, weight: 100, price: 20 }], ...overrides,
  });
  expect(created.status).toBe(201);
  const posted = await post(`/api/sales-invoices/${created.body.id}/post`, {});
  expect(posted.status).toBe(200);
  return SalesInvoice.findByPk(created.body.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
}
const balanceOf = async (Model, id) => Number((await Model.findByPk(id)).balance);

describe('sales invoice: date', () => {
  test('moves the invoice, its stock movement and its receipt, and leaves balance and stock alone', async () => {
    const inv = await postedSale();
    const before = { balance: await balanceOf(Customer, customer.id), stock: Number((await Stock.findOne({ where: { item_id: item.id } })).weight) };
    expect(before.balance).toBe(2180);

    const res = await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-05' });
    expect(res.status).toBe(200);
    expect(String((await SalesInvoice.findByPk(inv.id)).date)).toBe('2026-03-05');
    const mv = await StockMovement.findAll({ where: { movement_type: 'فاتورة بيع' } });
    expect(mv.map(m => String(m.date))).toEqual(['2026-03-05']);
    const receipts = await CashReceipt.findAll();
    expect(receipts.map(r => String(r.date))).toEqual(['2026-03-05']);
    expect(await balanceOf(Customer, customer.id)).toBe(before.balance);
    expect(Number((await Stock.findOne({ where: { item_id: item.id } })).weight)).toBe(before.stock);
    await expectInvariants('date correction');
  });

  test('a later payment that happens to carry another date is not dragged along', async () => {
    const inv = await postedSale();
    await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 50, date: '2026-03-02', payment_method: 'نقدي', notes: `دفعة فاتورة بيع ${inv.invoice_no}` });
    await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-05' });
    const dates = (await CashReceipt.findAll({ order: [['amount', 'ASC']] })).map(r => String(r.date));
    expect(dates).toEqual(['2026-03-02', '2026-03-05']);
  });

  test('impossible dates are refused: year 0001, far future, not a date', async () => {
    const inv = await postedSale();
    for (const date of ['0001-02-21', '2099-01-01', 'not-a-date']) {
      const res = await post(`/api/sales-invoices/${inv.id}/correct`, { date });
      expect([date, res.status]).toEqual([date, 400]);
    }
    expect(String((await SalesInvoice.findByPk(inv.id)).date)).toBe('2026-03-01');
  });

  test('...and a new or edited document cannot be dated like that in the first place', async () => {
    const bad = (date) => post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: wh.id, date, items: [{ item_id: item.id, quantity: 1, weight: 1, price: 1 }] });
    expect((await bad('0001-02-21')).status).toBe(400);
    expect((await bad('2099-01-01')).status).toBe(400);
    expect((await post('/api/delivery-notes', { date: '0001-02-21', customer_id: customer.id, items: [] })).status).toBe(400);
    expect((await post('/api/purchase-invoices', { supplier_id: supplier.id, date: '2099-01-01', items: [{ item_id: item.id, quantity: 1, weight: 1, price: 1 }] })).status).toBe(400);
  });
});

describe('sales invoice: price', () => {
  test('re-prices the lines, tax and total, moves the balance by the difference, and the movement and item price follow', async () => {
    const inv = await postedSale();
    const line = inv.items[0];
    const res = await post(`/api/sales-invoices/${inv.id}/correct`, { items: [{ id: line.id, price: 25 }] });
    expect(res.status).toBe(200);

    const fresh = await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    expect(Number(fresh.subtotal)).toBe(2500);
    expect(Number(fresh.tax_amount)).toBe(350);
    expect(Number(fresh.total)).toBe(2850);
    expect(Number(fresh.paid)).toBe(100);
    expect(Number(fresh.remaining)).toBe(2750);
    expect(Number(fresh.items[0].price)).toBe(25);
    expect(Number(fresh.items[0].total)).toBe(2500);
    expect(await balanceOf(Customer, customer.id)).toBe(2750);
    expect((await StockMovement.findOne({ where: { movement_type: 'فاتورة بيع' } })).unit_price).toBe('25.00');
    // the item carries the effective price (with tax): 2850 / 100 kg
    expect(Number((await Item.findByPk(item.id)).sale_price)).toBe(28.5);
    await expectInvariants('price correction');
  });

  test('a lower price lowers the balance, and one that makes the customer a creditor is allowed', async () => {
    const inv = await postedSale({ paid: 2000 });
    expect(await balanceOf(Customer, customer.id)).toBe(280);
    await post(`/api/sales-invoices/${inv.id}/correct`, { items: [{ id: inv.items[0].id, price: 10 }] });
    // 100 x 10 = 1000 + 140 tax = 1140, 2000 paid: the customer is owed 860
    expect(await balanceOf(Customer, customer.id)).toBe(-860);
    await expectInvariants('lower price');
  });

  test('the item price is left alone when a later invoice has already changed it', async () => {
    const first = await postedSale();
    await postedSale({ items: [{ item_id: item.id, quantity: 1, weight: 10, price: 40 }], paid: 0 });
    const after = Number((await Item.findByPk(item.id)).sale_price);
    expect(after).toBe(45.6);
    await post(`/api/sales-invoices/${first.id}/correct`, { items: [{ id: first.items[0].id, price: 25 }] });
    expect(Number((await Item.findByPk(item.id)).sale_price)).toBe(after);
  });

  test('only the price can change: quantity, weight and other fields in the request are ignored', async () => {
    const inv = await postedSale();
    const res = await post(`/api/sales-invoices/${inv.id}/correct`, { customer_id: 999, warehouse_id: 999, items: [{ id: inv.items[0].id, price: 22, quantity: 999, weight: 1, total: 1 }] });
    expect(res.status).toBe(200);
    const fresh = await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    expect(fresh.customer_id).toBe(customer.id);
    expect(fresh.warehouse_id).toBe(wh.id);
    expect(Number(fresh.items[0].weight)).toBe(100);
    expect(Number(fresh.items[0].quantity)).toBe(5);
    expect(Number(fresh.items[0].total)).toBe(2200);
  });

  test('refused: a draft, a line of another invoice, a bad price, nothing to change', async () => {
    const draft = (await post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: wh.id, date: '2026-03-01', items: [{ item_id: item.id, quantity: 1, weight: 10, price: 5 }] })).body;
    expect((await post(`/api/sales-invoices/${draft.id}/correct`, { date: '2026-03-02' })).status).toBe(400);

    const a = await postedSale();
    const b = await postedSale({ items: [{ item_id: item.id, quantity: 1, weight: 10, price: 5 }], paid: 0 });
    expect((await post(`/api/sales-invoices/${a.id}/correct`, { items: [{ id: b.items[0].id, price: 9 }] })).status).toBe(400);
    for (const price of [-1, 'abc']) expect((await post(`/api/sales-invoices/${a.id}/correct`, { items: [{ id: a.items[0].id, price }] })).status).toBe(400);
    expect((await post(`/api/sales-invoices/${a.id}/correct`, { date: '2026-03-01', items: [{ id: a.items[0].id, price: 20 }] })).status).toBe(400);
    expect((await post('/api/sales-invoices/99999/correct', { date: '2026-03-02' })).status).toBe(404);
  });

  test('a price change is refused when the invoice already has a return, a date change is not', async () => {
    const inv = await postedSale();
    await SalesReturn.create({ return_no: 'SR-1', date: '2026-03-03', invoice_id: inv.id, customer_id: customer.id, total: 0 });
    const price = await post(`/api/sales-invoices/${inv.id}/correct`, { items: [{ id: inv.items[0].id, price: 25 }] });
    expect(price.status).toBe(400);
    expect(Number((await SalesInvoice.findByPk(inv.id)).total)).toBe(2280);
    expect((await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-04' })).status).toBe(200);
  });

  test('nothing changes when the correction fails half way (the invoice date is in a closed year)', async () => {
    const inv = await postedSale();
    await FinancialYear.create({ name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: false, is_closed: true });
    const res = await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-05', items: [{ id: inv.items[0].id, price: 25 }] });
    expect(res.status).toBe(400);
    const fresh = await SalesInvoice.findByPk(inv.id);
    expect(String(fresh.date)).toBe('2026-03-01');
    expect(Number(fresh.total)).toBe(2280);
    expect(await balanceOf(Customer, customer.id)).toBe(2180);
  });

  test('moving an invoice INTO a closed year is refused too', async () => {
    const inv = await postedSale({ date: '2026-03-01' });
    await FinancialYear.create({ name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', is_active: false, is_closed: true });
    expect((await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2025-12-20' })).status).toBe(400);
    expect(String((await SalesInvoice.findByPk(inv.id)).date)).toBe('2026-03-01');
  });
});

describe('invoice from a delivery note', () => {
  async function deliveredNote() {
    const note = (await post('/api/delivery-notes', { date: '2026-03-01', customer_id: customer.id, warehouse_id: wh.id, items: [{ item_id: item.id, net_weight: 100, roll_count: 10 }] })).body;
    const res = await post(`/api/delivery-notes/${note.id}/deliver`, {
      items: [{ item_id: item.id, price: 20, tax_rate: 14 }],
      payments: [{ method: 'cash', amount: 100 }, { method: 'check', amount: 300, check_no: 'CH1', due_date: '2026-04-01' }],
    });
    expect(res.status).toBe(200);
    return { note, invoiceId: res.body.invoice_id };
  }

  test('the date also moves the delivery note, its movement and the cash taken with it', async () => {
    const { note, invoiceId } = await deliveredNote();
    const res = await post(`/api/sales-invoices/${invoiceId}/correct`, { date: '2026-03-04' });
    expect(res.status).toBe(200);
    expect(String((await DeliveryNote.findByPk(note.id)).date)).toBe('2026-03-04');
    expect(String((await StockMovement.findOne({ where: { movement_type: 'فاتورة بيع' } })).date)).toBe('2026-03-04');
    expect(String((await CashReceipt.findOne()).date)).toBe('2026-03-04');
    await expectInvariants('delivery-note date');
  });

  test('the price follows into the balance and the item keeps the plain price a note sets', async () => {
    const { invoiceId } = await deliveredNote();
    // 100 x 20 = 2000 + 280 tax = 2280; 100 cash and 300 check taken -> 1880 owed
    expect(await balanceOf(Customer, customer.id)).toBe(1880);
    const line = (await SalesInvoiceItem.findOne({ where: { invoice_id: invoiceId } }));
    const res = await post(`/api/sales-invoices/${invoiceId}/correct`, { items: [{ id: line.id, price: 30 }] });
    expect(res.status).toBe(200);
    // 3000 + 420 = 3420 -> 570 + 100 + ... the customer owes the 1140 difference more
    expect(await balanceOf(Customer, customer.id)).toBe(1880 + 1140);
    expect(Number((await Item.findByPk(item.id)).sale_price)).toBe(30);
    await expectInvariants('delivery-note price');
  });
});

describe('purchase invoice', () => {
  async function postedPurchase() {
    const created = await post('/api/purchase-invoices', {
      supplier_id: supplier.id, warehouse_id: wh.id, date: '2026-03-01', tax_rate: 14, paid: 100,
      items: [{ item_id: item.id, quantity: 5, weight: 100, price: 20 }],
    });
    expect(created.status).toBe(201);
    expect((await post(`/api/purchase-invoices/${created.body.id}/post`, {})).status).toBe(200);
    return PurchaseInvoice.findByPk(created.body.id, { include: [{ model: models.PurchaseInvoiceItem, as: 'items' }] });
  }

  test('date moves the invoice, the movement and the payment; the supplier balance stays', async () => {
    const inv = await postedPurchase();
    expect(await balanceOf(Supplier, supplier.id)).toBe(2180);
    expect((await post(`/api/purchase-invoices/${inv.id}/correct`, { date: '2026-03-06' })).status).toBe(200);
    expect(String((await PurchaseInvoice.findByPk(inv.id)).date)).toBe('2026-03-06');
    expect(String((await StockMovement.findOne({ where: { movement_type: 'فاتورة شراء' } })).date)).toBe('2026-03-06');
    expect(String((await CashPayment.findOne()).date)).toBe('2026-03-06');
    expect(await balanceOf(Supplier, supplier.id)).toBe(2180);
    await expectInvariants('purchase date');
  });

  test('price moves the supplier balance and the item purchase price', async () => {
    const inv = await postedPurchase();
    expect((await post(`/api/purchase-invoices/${inv.id}/correct`, { items: [{ id: inv.items[0].id, price: 30 }] })).status).toBe(200);
    // 3000 + 420 tax = 3420, 100 paid
    const fresh = await PurchaseInvoice.findByPk(inv.id);
    expect(Number(fresh.total)).toBe(3420);
    expect(await balanceOf(Supplier, supplier.id)).toBe(3320);
    expect((await StockMovement.findOne({ where: { movement_type: 'فاتورة شراء' } })).unit_price).toBe('30.00');
    expect(Number((await Item.findByPk(item.id)).purchase_price)).toBe(34.2);
    await expectInvariants('purchase price');
  });
});

describe('who may correct', () => {
  const makeUser = (permissions) => User.create({ username: `u${Math.random()}`, password: 'x', role: 'user', permissions });

  test('edit rights are not enough: the separate "correct" permission is needed, for sales and for purchases', async () => {
    const inv = await postedSale();
    const editor = tokenFor(await makeUser({ sales_invoices: ['view', 'create', 'edit', 'delete'] }));
    expect((await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-05' }, editor)).status).toBe(403);
    const corrector = tokenFor(await makeUser({ sales_invoices: ['view', 'correct'] }));
    expect((await post(`/api/sales-invoices/${inv.id}/correct`, { date: '2026-03-05' }, corrector)).status).toBe(200);
    // the sales permission does not open the purchase side
    expect((await post('/api/purchase-invoices/1/correct', { date: '2026-03-05' }, corrector)).status).toBe(403);
  });

  test('the permission alone gives nothing else: no edit, no delete, no other module', async () => {
    const inv = await postedSale();
    const corrector = tokenFor(await makeUser({ sales_invoices: ['view', 'correct'] }));
    expect((await request(app).put(`/api/sales-invoices/${inv.id}`).set(as(corrector)).send({ notes: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/sales-invoices/${inv.id}`).set(as(corrector))).status).toBe(403);
    expect((await request(app).get('/api/purchase-invoices').set(as(corrector))).status).toBe(403);
  });

  test('a posted invoice still cannot be edited the plain way, even by an admin', async () => {
    const inv = await postedSale();
    const res = await request(app).put(`/api/sales-invoices/${inv.id}`).set(as(adminT)).send({ date: '2026-03-09' });
    expect(res.status).toBe(400);
  });
});

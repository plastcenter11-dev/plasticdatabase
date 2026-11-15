// A server used by several branches at once: it must not believe the screen's numbers, and two users
// working at the same moment must not step on each other.

const request = require('supertest');
const app = require('../../app');
const models = require('../../models');
const { sequelize, SalesInvoice, SalesInvoiceItem, Customer, Supplier, Stock, StockMovement, CashReceipt, Check, DeliveryNote, SalesReturn } = models;
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

let token, warehouse, item, customer, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (url, body) => request(app).post(url).set(auth()).send(body);
const put = (url, body) => request(app).put(url).set(auth()).send(body);
const get = async (url) => (await request(app).get(url).set(auth())).body;
const balance = async (Model, id) => Number((await Model.findByPk(id)).balance);

const seedStock = async (it, weight = 1000, qty = 100) => {
  await Stock.create({ item_id: it.id, warehouse_id: warehouse.id, quantity: qty, weight });
  await StockMovement.create({ item_id: it.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: qty, weight, date: '2026-01-01', description: 'رصيد افتتاحي' });
};

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse();
  item = await makeItem();
  customer = await makeCustomer();
  supplier = await makeSupplier();
  await seedStock(item);
});

// 10 kg at 100 = 1000 before tax
const invoice = (o = {}) => ({
  customer_id: customer.id, warehouse_id: warehouse.id, date: '2026-03-01',
  items: [{ item_id: item.id, quantity: 1, weight: 10, price: 100, discount: 0 }], ...o,
});

describe('the server works out the invoice money itself', () => {
  test('whatever totals and status the client sends, the saved ones are computed', async () => {
    const res = await post('/api/sales-invoices', invoice({
      tax_rate: 14, status: 'posted', subtotal: 999999, tax_amount: 0, total: 1, remaining: 0, paid: 100, approved_at: '2026-01-01',
    }));
    expect(res.status).toBe(201);
    const inv = await SalesInvoice.findByPk(res.body.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    expect(inv.status).toBe('draft');                  // not "posted" without going through posting
    expect(inv.approved_at).toBeNull();
    expect(Number(inv.subtotal)).toBe(1000);
    expect(Number(inv.tax_amount)).toBe(140);
    expect(Number(inv.total)).toBe(1140);
    expect(Number(inv.remaining)).toBe(1040);          // total less the 100 paid
    expect(Number(inv.items[0].total)).toBe(1000);
    expect(await balance(Customer, customer.id)).toBe(0); // nothing posted, no balance moved
  });

  test('the VAT is on the net after the line and header discounts', async () => {
    const res = await post('/api/sales-invoices', invoice({
      tax_rate: 14, discount: 100, items: [{ item_id: item.id, quantity: 1, weight: 10, price: 100, discount: 5 }],
    }));
    const inv = await SalesInvoice.findByPk(res.body.id);
    expect(Number(inv.subtotal)).toBe(950);            // 1000 less 5%
    expect(Number(inv.tax_amount)).toBe(119);          // 14% of (950 - 100)
    expect(Number(inv.total)).toBe(969);
  });

  test('impossible numbers are refused', async () => {
    expect((await post('/api/sales-invoices', invoice({ discount: 99999 }))).status).toBe(400);
    expect((await post('/api/sales-invoices', invoice({ tax_rate: 150 }))).status).toBe(400);
    expect((await post('/api/sales-invoices', invoice({ paid: -5 }))).status).toBe(400);
    expect((await post('/api/sales-invoices', invoice({ items: [{ item_id: item.id, weight: 10, price: -1 }] }))).status).toBe(400);
    expect((await post('/api/sales-invoices', invoice({ items: [{ item_id: item.id, weight: 10, price: 5, discount: 120 }] }))).status).toBe(400);
    expect(await SalesInvoice.count()).toBe(0);
  });

  test('editing a draft works the money out again, also when only the header changes', async () => {
    const created = (await post('/api/sales-invoices', invoice({ tax_rate: 14 }))).body;
    const edited = await put(`/api/sales-invoices/${created.id}`, { discount: 200, items: [{ item_id: item.id, quantity: 1, weight: 20, price: 100 }], total: 1 });
    expect(edited.status).toBe(200);
    let inv = await SalesInvoice.findByPk(created.id);
    expect(Number(inv.subtotal)).toBe(2000);
    expect(Number(inv.total)).toBe(2000 - 200 + 252);  // VAT on 1800

    await put(`/api/sales-invoices/${created.id}`, { discount: 0, status: 'posted' });
    inv = await SalesInvoice.findByPk(created.id);
    expect(inv.status).toBe('draft');
    expect(Number(inv.total)).toBe(2000 + 280);        // lines kept, new discount applied
  });

  test('purchase invoices too', async () => {
    const res = await post('/api/purchase-invoices', {
      supplier_id: supplier.id, warehouse_id: warehouse.id, date: '2026-03-01', tax_rate: 14, status: 'posted', total: 1,
      items: [{ item_id: item.id, quantity: 1, weight: 10, price: 100 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(Number(res.body.total)).toBe(1140);
  });
});

describe('fields that belong to the server are ignored', () => {
  test('a customer cannot be given a balance or a new id through the API', async () => {
    const res = await post('/api/customers', { name: 'عميل جديد', balance: 5000, id: 777 });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(777);
    expect(await balance(Customer, res.body.id)).toBe(0);
    await put(`/api/customers/${customer.id}`, { phone: '0100', balance: 9999, id: 888 });
    const c = await Customer.findByPk(customer.id);
    expect(c.phone).toBe('0100');
    expect(Number(c.balance)).toBe(0);
  });

  test('a check is created pending whatever status is sent, and so is its balance effect', async () => {
    const res = await post('/api/finance/checks', { check_no: 'K1', party_type: 'customer', party_id: customer.id, amount: 300, date: '2026-03-01', due_date: '2026-06-01', status: 'collected', bounced_date: '2026-03-02' });
    expect(res.status).toBe(201);
    const c = await Check.findByPk(res.body.id);
    expect(c.status).toBe('pending');
    expect(c.bounced_date).toBeNull();
  });

  test('a delivery note cannot be created already delivered or with an invoice number', async () => {
    const res = await post('/api/delivery-notes', { date: '2026-03-01', customer_id: customer.id, status: 'delivered', invoice_no: 'FAKE-1', items: [] });
    expect(res.status).toBe(201);
    const n = await DeliveryNote.findByPk(res.body.id);
    expect(n.status).not.toBe('delivered');
    expect(n.invoice_no).toBeFalsy();
  });
});

describe('the money of a return comes from the invoice', () => {
  const postedSale = async () => {
    const inv = (await post('/api/sales-invoices', invoice({ tax_rate: 14, items: [{ item_id: item.id, quantity: 4, weight: 100, price: 10 }] }))).body;
    expect((await post(`/api/sales-invoices/${inv.id}/post`, {})).status).toBe(200);
    return inv; // 1000 + 140 VAT = 1140
  };

  test('the price typed in the request is ignored; tax is stored', async () => {
    const inv = await postedSale();
    const res = await post('/api/returns/sales', {
      customer_id: customer.id, invoice_id: inv.id, warehouse_id: warehouse.id, date: '2026-03-05', total: 1,
      items: [{ item_id: item.id, quantity: 0, weight: 50, price: 0.01, discount: 0, total: 0.5 }],
    });
    expect(res.status).toBe(201);
    const r = await SalesReturn.findByPk(res.body.id);
    expect(Number(r.total)).toBe(570);          // half of the invoice: 1140 / 2
    expect(Number(r.tax_amount)).toBe(70);      // half of its 140 VAT
  });

  test('a return from a draft invoice or from another customer is refused', async () => {
    const draft = (await post('/api/sales-invoices', invoice({ items: [{ item_id: item.id, quantity: 1, weight: 10, price: 10 }] }))).body;
    const line = { item_id: item.id, quantity: 0, weight: 5, price: 10 };
    expect((await post('/api/returns/sales', { customer_id: customer.id, invoice_id: draft.id, warehouse_id: warehouse.id, date: '2026-03-05', items: [line] })).status).toBe(400);
    const inv = await postedSale();
    const other = await makeCustomer({ name: 'عميل آخر' });
    expect((await post('/api/returns/sales', { customer_id: other.id, invoice_id: inv.id, warehouse_id: warehouse.id, date: '2026-03-05', items: [line] })).status).toBe(400);
  });
});

describe('document numbers', () => {
  test('ten receipts saved at the same moment get ten different numbers and all count', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 100, date: '2026-03-01' })));
    expect(results.map(r => r.status)).toEqual(Array(10).fill(201));
    expect(new Set(results.map(r => r.body.receipt_no)).size).toBe(10);
    expect(await balance(Customer, customer.id)).toBe(-1000);
  });

  test('deleting the last document does not make its number come back', async () => {
    const first = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 10, date: '2026-03-01' })).body;
    expect(first.receipt_no).toBe('CR-000001');
    await request(app).delete(`/api/finance/cash-receipts/${first.id}`).set(auth());
    const second = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 10, date: '2026-03-01' })).body;
    expect(second.receipt_no).toBe('CR-000002');
  });

  test('a counter starts above the documents that already exist', async () => {
    await CashReceipt.create({ receipt_no: 'CR-000050', date: '2026-01-01', amount: 5, customer_id: customer.id });
    const res = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 10, date: '2026-03-01' })).body;
    expect(res.receipt_no).toBe('CR-000051');
  });

  test('a rolled-back document gives its number back (no gaps)', async () => {
    const bad = await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 10 }); // no date -> fails
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const ok = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 10, date: '2026-03-01' })).body;
    expect(ok.receipt_no).toBe('CR-000001');
  });
});

describe('two users at the same moment', () => {
  test('posting the same invoice twice at once posts it once', async () => {
    const inv = (await post('/api/sales-invoices', invoice({ tax_rate: 0 }))).body; // 1000
    const [a, b] = await Promise.all([post(`/api/sales-invoices/${inv.id}/post`, {}), post(`/api/sales-invoices/${inv.id}/post`, {})]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(990);             // 10 kg left once, not twice
    expect(await balance(Customer, customer.id)).toBe(1000);
    expect(await StockMovement.count({ where: { movement_type: 'فاتورة بيع' } })).toBe(1);
  });

  test('two invoices that together need more than the stock cannot both be posted', async () => {
    const big = () => post('/api/sales-invoices', invoice({ tax_rate: 0, items: [{ item_id: item.id, quantity: 8, weight: 800, price: 1 }] }));
    const [i1, i2] = [(await big()).body, (await big()).body];
    const results = await Promise.all([post(`/api/sales-invoices/${i1.id}/post`, {}), post(`/api/sales-invoices/${i2.id}/post`, {})]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]); // 1000 kg in stock, 800 + 800 wanted
    const stock = await Stock.findOne({ where: { item_id: item.id, warehouse_id: warehouse.id } });
    expect(Number(stock.weight)).toBe(200);
  });

  test('receipts and refunds for the same customer at once all count', async () => {
    const jobs = [];
    for (let i = 0; i < 5; i++) jobs.push(post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 100, date: '2026-03-01' }));
    for (let i = 0; i < 3; i++) jobs.push(post('/api/finance/cash-payments', { customer_id: customer.id, amount: 50, date: '2026-03-01' }));
    const results = await Promise.all(jobs);
    expect(results.every(r => r.status === 201)).toBe(true);
    expect(await balance(Customer, customer.id)).toBe(-500 + 150);
  });

  test('the same receipt deleted twice at once is reversed once', async () => {
    const r = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 100, date: '2026-03-01' })).body;
    const del = () => request(app).delete(`/api/finance/cash-receipts/${r.id}`).set(auth());
    const results = await Promise.all([del(), del()]);
    expect(results.map(x => x.status).sort()).toEqual([200, 404]);
    expect(await balance(Customer, customer.id)).toBe(0);
  });

  test('only one stock row can exist per item and warehouse', async () => {
    await expect(Stock.create({ item_id: item.id, warehouse_id: warehouse.id, quantity: 1, weight: 1 })).rejects.toThrow();
  });
});

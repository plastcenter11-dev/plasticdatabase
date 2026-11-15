// Accounting bugs found in an audit:
//  - "delete selected" removed POSTED invoices without reversing anything
//  - an invoice made by posting a delivery note stored tax-inclusive line totals and a default tax rate
//  - zero / negative amounts were accepted on receipts, payments, checks, expenses, other income
//  - deleting the receipt of a payment typed on an invoice left the invoice showing it as paid

const request = require('supertest');
const app = require('../../app');
const models = require('../../models');
const { sequelize, SalesInvoice, PurchaseInvoice, SalesInvoiceItem, Customer, Stock, StockMovement } = models;
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');
const { checkInvariants } = require('../../utils/invariants');

let token, warehouse, item, customer, supplier;
const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (url, body) => request(app).post(url).set(auth()).send(body);
const getJson = async (url) => (await request(app).get(url).set(auth())).body;
// opening stock with its movement, so the stock-vs-movements check has nothing to complain about
const seedStock = async (it) => {
  await Stock.create({ item_id: it.id, warehouse_id: warehouse.id, quantity: 100, weight: 1000 });
  await StockMovement.create({ item_id: it.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: 100, weight: 1000, date: '2026-01-01', description: 'رصيد افتتاحي' });
};
const errorsOf = async () => (await checkInvariants({ models, sequelize, getJson })).flatMap(r => r.violations).filter(v => v.severity === 'error');

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

const salesPayload = (o = {}) => ({
  customer_id: customer.id, warehouse_id: warehouse.id, invoice_no: `SI-${Math.random()}`, date: '2026-03-01',
  subtotal: 500, discount: 0, tax_rate: 14, tax_amount: 70, total: 570, paid: 0, remaining: 570,
  items: [{ item_id: item.id, quantity: 10, weight: 50, price: 10, discount: 0, total: 500 }], ...o,
});
const purchasePayload = (o = {}) => ({
  supplier_id: supplier.id, warehouse_id: warehouse.id, invoice_no: `PI-${Math.random()}`, date: '2026-03-01',
  subtotal: 500, discount: 0, tax_rate: 14, tax_amount: 70, total: 570, paid: 0, remaining: 570,
  items: [{ item_id: item.id, quantity: 10, weight: 50, price: 10, discount: 0, total: 500 }], ...o,
});

describe('bulk delete of invoices', () => {
  test('sales: a selection containing a posted invoice is refused as a whole', async () => {
    const draft = (await post('/api/sales-invoices', salesPayload())).body;
    const posted = (await post('/api/sales-invoices', salesPayload())).body;
    expect((await post(`/api/sales-invoices/${posted.id}/post`, {})).status).toBe(200);

    const res = await post('/api/sales-invoices/bulk-delete', { ids: [draft.id, posted.id] });
    expect(res.status).toBe(400);
    expect(await SalesInvoice.count()).toBe(2); // nothing was deleted, not even the draft
    expect((await errorsOf())).toEqual([]);
  });

  test('sales: drafts are deleted', async () => {
    const a = (await post('/api/sales-invoices', salesPayload())).body;
    const b = (await post('/api/sales-invoices', salesPayload())).body;
    const res = await post('/api/sales-invoices/bulk-delete', { ids: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(await SalesInvoice.count()).toBe(0);
  });

  test('purchases: a posted invoice is refused, drafts are deleted', async () => {
    const draft = (await post('/api/purchase-invoices', purchasePayload())).body;
    const posted = (await post('/api/purchase-invoices', purchasePayload())).body;
    expect((await post(`/api/purchase-invoices/${posted.id}/post`, {})).status).toBe(200);
    expect((await post('/api/purchase-invoices/bulk-delete', { ids: [draft.id, posted.id] })).status).toBe(400);
    expect(await PurchaseInvoice.count()).toBe(2);
    expect((await post('/api/purchase-invoices/bulk-delete', { ids: [draft.id] })).status).toBe(200);
    expect(await PurchaseInvoice.count()).toBe(1);
  });
});

describe('invoice made by posting a delivery note', () => {
  const deliver = async (lines, price, tax_rate) => {
    const note = (await post('/api/delivery-notes', {
      date: '2026-03-01', customer_id: customer.id, warehouse_id: warehouse.id,
      items: lines.map(l => ({ item_id: l.item_id, net_weight: l.w, roll_count: 1 })),
    })).body;
    return post(`/api/delivery-notes/${note.id}/deliver`, { items: lines.map(l => ({ item_id: l.item_id, price: l.price, tax_rate: l.tax })) });
  };

  test('line totals are before tax and the header tax rate is the rate really charged', async () => {
    const res = await deliver([{ item_id: item.id, w: 100, price: 10, tax: 14 }]);
    expect(res.status).toBe(200);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    expect(Number(inv.subtotal)).toBe(1000);
    expect(Number(inv.tax_amount)).toBe(140);
    expect(Number(inv.total)).toBe(1140);
    expect(Number(inv.tax_rate)).toBe(14);
    expect(Number(inv.items[0].total)).toBe(1000);
    expect(await errorsOf()).toEqual([]);
  });

  test('cash taken when posting shows on the invoice as paid, and deleting the receipt un-pays it', async () => {
    const note = (await post('/api/delivery-notes', {
      date: '2026-03-01', customer_id: customer.id, warehouse_id: warehouse.id, items: [{ item_id: item.id, net_weight: 100, roll_count: 1 }],
    })).body;
    const res = await post(`/api/delivery-notes/${note.id}/deliver`, {
      invoice_no: 'DN-INV-1', items: [{ item_id: item.id, price: 10, tax_rate: 14 }],
      payments: [{ method: 'cash', amount: 400 }, { method: 'check', amount: 300, check_no: 'CK-77', due_date: '2026-06-01' }],
    });
    expect(res.status).toBe(200);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(Number(inv.total)).toBe(1140);
    expect(Number(inv.paid)).toBe(400); // cash only, the check lives on the checks screen
    expect(Number(inv.remaining)).toBe(740);
    expect(await errorsOf()).toEqual([]);

    const receipt = (await getJson('/api/finance/cash-receipts')).find(r => r.notes === 'دفعة فاتورة بيع DN-INV-1');
    expect(receipt).toBeDefined();
    expect((await request(app).delete(`/api/finance/cash-receipts/${receipt.id}`).set(auth())).status).toBe(200);
    const after = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(Number(after.paid)).toBe(0);
    expect(Number(after.remaining)).toBe(1140);
    expect(await errorsOf()).toEqual([]);
  });

  test('an untaxed delivery has a 0 tax rate, not the default 14', async () => {
    const res = await deliver([{ item_id: item.id, w: 100, price: 10 }]);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(Number(inv.tax_amount)).toBe(0);
    expect(Number(inv.tax_rate)).toBe(0);
    expect(Number(inv.total)).toBe(1000);
  });

  test('a mix of taxed and untaxed lines gets the blended rate', async () => {
    const other = await makeItem({ name: 'صنف 2' });
    await seedStock(other);
    const res = await deliver([{ item_id: item.id, w: 100, price: 10, tax: 14 }, { item_id: other.id, w: 100, price: 10 }]);
    const inv = await SalesInvoice.findByPk(res.body.invoice_id);
    expect(Number(inv.subtotal)).toBe(2000);
    expect(Number(inv.tax_amount)).toBe(140);
    expect(Number(inv.tax_rate)).toBe(7);
    expect(await errorsOf()).toEqual([]);
  });
});

describe('amounts must be positive', () => {
  const cases = [
    ['cash receipt', '/api/finance/cash-receipts', () => ({ customer_id: customer.id })],
    ['cash payment', '/api/finance/cash-payments', () => ({ supplier_id: supplier.id })],
    ['check', '/api/finance/checks', () => ({ check_no: 'K1', party_type: 'customer', party_id: customer.id, due_date: '2026-06-01' })],
    ['expense', '/api/finance/expenses', () => ({ description: 'مصروف' })],
    ['other income', '/api/finance/other-income', () => ({ description: 'إيراد' })],
  ];
  test.each(cases)('%s refuses zero, negative and missing amounts', async (_name, url, base) => {
    for (const amount of [0, -50, undefined, 'abc']) {
      const res = await post(url, { date: '2026-05-01', ...base(), amount });
      expect(res.status).toBe(400);
    }
    const ok = await post(url, { date: '2026-05-01', ...base(), amount: 25 });
    expect(ok.status).toBe(201);
    expect((await Customer.findByPk(customer.id)).balance).toBeDefined();
  });
});

describe('a cash receipt needs a customer', () => {
  test('without one it is refused (the money would belong to nobody)', async () => {
    const res = await post('/api/finance/cash-receipts', { amount: 100, date: '2026-05-01' });
    expect(res.status).toBe(400);
    expect((await getJson('/api/finance/cash-receipts')).length).toBe(0);
  });
});

describe('deleting the receipt of a payment typed on an invoice', () => {
  test('sales: the invoice goes back to unpaid and the books still agree', async () => {
    const created = (await post('/api/sales-invoices', salesPayload({ paid: 200, remaining: 370 }))).body;
    expect((await post(`/api/sales-invoices/${created.id}/post`, {})).status).toBe(200);
    const receipt = (await getJson('/api/finance/cash-receipts')).find(r => r.notes.includes(created.invoice_no));
    expect(receipt).toBeDefined();

    const del = await request(app).delete(`/api/finance/cash-receipts/${receipt.id}`).set(auth());
    expect(del.status).toBe(200);
    const inv = await SalesInvoice.findByPk(created.id);
    expect(Number(inv.paid)).toBe(0);
    expect(Number(inv.remaining)).toBe(570);
    expect(await errorsOf()).toEqual([]);
  });

  test('purchases: same for a supplier payment', async () => {
    const created = (await post('/api/purchase-invoices', purchasePayload({ paid: 300, remaining: 270 }))).body;
    expect((await post(`/api/purchase-invoices/${created.id}/post`, {})).status).toBe(200);
    const payment = (await getJson('/api/finance/cash-payments')).find(p => p.notes.includes(created.invoice_no));
    expect(payment).toBeDefined();

    expect((await request(app).delete(`/api/finance/cash-payments/${payment.id}`).set(auth())).status).toBe(200);
    const inv = await PurchaseInvoice.findByPk(created.id);
    expect(Number(inv.paid)).toBe(0);
    expect(Number(inv.remaining)).toBe(570);
    expect(await errorsOf()).toEqual([]);
  });

  test('a receipt that is not an invoice payment leaves invoices alone', async () => {
    const created = (await post('/api/sales-invoices', salesPayload({ paid: 100, remaining: 470 }))).body;
    await post(`/api/sales-invoices/${created.id}/post`, {});
    const loose = (await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 50, date: '2026-03-02', notes: 'دفعة عامة' })).body;
    await request(app).delete(`/api/finance/cash-receipts/${loose.id}`).set(auth());
    expect(Number((await SalesInvoice.findByPk(created.id)).paid)).toBe(100);
  });
});

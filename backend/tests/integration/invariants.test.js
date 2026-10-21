// Accounting / stock invariants (utils/invariants.js).
//
// 1. A realistic working day is driven through the real routes - purchases, stock
//    entries, a transfer, assemblies (with extra expenses and a component issued
//    before it was received), sales with payments, a delivery note paid by cash
//    and check, returns, receipts, payments, a bounced check, an opening balance -
//    and after EVERY step the invariants must still hold.
// 2. The checker itself is proven sensitive: tampering with the data the way past
//    bugs did must be reported.

const request = require('supertest');
const express = require('express');
const models = require('../../models');
const { checkInvariants } = require('../../utils/invariants');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const { sequelize, Stock, StockMovement, CashReceipt, OpeningBalance, SalesInvoice, PurchaseInvoice } = models;

const app = express();
app.use(express.json());
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));
app.use('/api/delivery-notes', require('../../routes/deliveryNotes'));
app.use('/api/returns', require('../../routes/returns'));
app.use('/api/finance', require('../../routes/finance'));
app.use('/api/stock', require('../../routes/stock'));
app.use('/api/customers', require('../../routes/customers'));
app.use('/api/suppliers', require('../../routes/suppliers'));

let token, w1, w2, itemA, itemB, itemC, service, supplier, customer;
const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (url, body) => request(app).post(url).set(auth()).send(body);
const put = (url, body) => request(app).put(url).set(auth()).send(body);

const getJson = async (url) => {
  const res = await request(app).get(url).set(auth());
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}`);
  return res.body;
};
const run = (only) => checkInvariants({ models, sequelize, getJson, only });
const errorsOf = (results) => results.flatMap(r => r.violations.filter(v => v.severity === 'error').map(v => `[${r.code}] ${v.message}`));
const expectClean = async (step) => {
  const errors = errorsOf(await run());
  if (errors.length) throw new Error(`invariants broken after "${step}":\n  ${errors.join('\n  ')}`);
};

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  w1 = await makeWarehouse({ name: 'W1' });
  w2 = await makeWarehouse({ name: 'W2' });
  itemA = await makeItem({ purchase_price: 10, is_stockable: true });
  itemB = await makeItem({ purchase_price: 20, is_stockable: true });
  itemC = await makeItem({ purchase_price: 0, is_stockable: true });
  service = await makeItem({ is_stockable: false });
  supplier = await makeSupplier({ name: 'مورد' });
  customer = await makeCustomer({ name: 'عميل' });
});

const line = (item, quantity, weight, price) => ({ item_id: item.id, quantity, weight, price, discount: 0, total: (weight || quantity) * price });

async function postPurchase(no, items, paid = 0) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const created = await post('/api/purchase-invoices', { supplier_id: supplier.id, warehouse_id: w1.id, invoice_no: no, date: '2026-05-01', subtotal: total, total, paid, remaining: total - paid, items });
  expect(created.status).toBe(201);
  const posted = await post(`/api/purchase-invoices/${created.body.id}/post`);
  expect(posted.status).toBe(200);
  return created.body;
}
async function postSale(no, items, paid = 0, extra = {}) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const created = await post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: w1.id, invoice_no: no, date: '2026-05-10', subtotal: total, total, tax_rate: 0, tax_amount: 0, paid, remaining: total - paid, items, ...extra });
  expect(created.status).toBe(201);
  const posted = await post(`/api/sales-invoices/${created.body.id}/post`);
  expect(posted.status).toBe(200);
  return created.body;
}

describe('a working day keeps every invariant', () => {
  test('step by step', async () => {
    await expectClean('empty database');

    // purchases: one fully paid, one partly paid, one for a service item
    await postPurchase('PI-T1', [line(itemA, 100, 1000, 10), line(itemB, 50, 500, 20)], 4000);
    await expectClean('purchase invoice with a partial payment');
    await postPurchase('PI-T2', [line(itemA, 10, 100, 10)], 1000);
    await expectClean('second purchase, paid in full');
    await postPurchase('PI-T3', [line(service, 1, 0, 300)]);
    await expectClean('purchase of a non-stock item');

    // stock entries
    expect((await post('/api/stock/adjustments', { item_id: itemB.id, warehouse_id: w1.id, movement_type: 'إضافة', quantity: 20, weight: 200, date: '2026-05-02' })).status).toBe(201);
    expect((await post('/api/stock/adjustments', { item_id: itemA.id, warehouse_id: w1.id, movement_type: 'صرف', quantity: 10, weight: 100, date: '2026-05-02' })).status).toBe(201);
    await expectClean('stock receive and issue');
    expect((await post('/api/stock/adjustments', { item_id: itemC.id, warehouse_id: w2.id, movement_type: 'تعديل جرد', quantity: 5, weight: 50, date: '2026-05-02' })).status).toBe(201);
    await expectClean('stock count');

    // an issue before its receipt: the balance goes negative, the receipt arrives later
    expect((await post('/api/stock/adjustments', { item_id: itemC.id, warehouse_id: w2.id, movement_type: 'صرف', quantity: 8, weight: 80, date: '2026-05-03' })).status).toBe(201);
    await expectClean('issue beyond the balance (negative)');
    expect((await post('/api/stock/adjustments', { item_id: itemC.id, warehouse_id: w2.id, movement_type: 'إضافة', quantity: 8, weight: 80, date: '2026-05-04' })).status).toBe(201);
    await expectClean('late receipt');

    // transfer
    const transfer = await post('/api/stock/transfers', { from_warehouse_id: w1.id, to_warehouse_id: w2.id, date: '2026-05-05', items: [{ item_id: itemA.id, quantity: 20, weight: 200 }] });
    expect(transfer.status).toBe(201);
    expect((await post(`/api/stock/transfers/${transfer.body.id}/confirm`)).status).toBe(200);
    await expectClean('warehouse transfer');

    // assembly: components, an extra-expenses line, and a component beyond its balance
    const assemblyBody = (components, extra = {}) => ({
      date: '2026-05-06', assembled_item_id: itemC.id, assembled_qty: 10, assembled_weight: 100, warehouse_id: w1.id, output_warehouse_id: w2.id, components, ...extra,
    });
    const asm = await post('/api/stock/assemblies', assemblyBody([
      { item_id: itemA.id, quantity: 30, weight: 300, warehouse_id: w1.id },
      { item_id: itemB.id, quantity: 90, weight: 900, warehouse_id: w1.id }, // more than the 700 on hand
      { is_expense: true, quantity: 2, price: 150 },
    ]));
    expect(asm.status).toBe(201);
    await expectClean('assembly (extra expenses and a negative component)');
    const edited = await put(`/api/stock/assemblies/${asm.body.id}`, assemblyBody([
      { item_id: itemA.id, quantity: 20, weight: 200, warehouse_id: w1.id },
      { item_id: itemB.id, quantity: 10, weight: 100, warehouse_id: w1.id },
    ]));
    expect(edited.status).toBe(200);
    await expectClean('assembly edited');
    const asm2 = await post('/api/stock/assemblies', assemblyBody([{ item_id: itemA.id, quantity: 5, weight: 50, warehouse_id: w1.id }]));
    expect(asm2.status).toBe(201);
    expect((await request(app).delete(`/api/stock/assemblies/${asm2.body.id}`).set(auth())).status).toBe(200);
    await expectClean('assembly deleted');

    // sales: a normal line plus a line that has only a weight, with a payment on the invoice
    // sold from W2, where item C (the assembly output) and the transferred item A are
    const sale = await postSale('SI-T1', [line(itemA, 10, 100, 15), line(itemC, 0, 40, 30)], 500, { warehouse_id: w2.id });
    await expectClean('sales invoice with a payment and a weight-only line');
    expect(await CashReceipt.count({ where: { customer_id: customer.id } })).toBe(1);
    await postSale('SI-T2', [line(service, 1, 0, 200)]);
    await expectClean('sales invoice for a service');

    // delivery note paid by cash and check
    const note = await post('/api/delivery-notes', { customer_id: customer.id, date: '2026-05-12', warehouse_id: w1.id, items: [{ item_id: itemB.id, net_weight: 100, roll_count: 10 }] });
    expect(note.status).toBe(201);
    const delivered = await post(`/api/delivery-notes/${note.body.id}/deliver`, {
      invoice_no: 'SI-DN1', warehouse_id: w1.id, items: [{ item_id: itemB.id, price: 40, tax_rate: 0 }],
      payments: [{ method: 'cash', amount: 1000, date: '2026-05-12' }, { method: 'check', amount: 500, date: '2026-05-12', check_no: 'CK-1', due_date: '2026-06-12' }],
    });
    expect(delivered.status).toBe(200);
    await expectClean('delivery note posted with cash and check');
    await post('/api/delivery-notes', { customer_id: customer.id, date: '2026-05-13', items: [{ item_id: itemB.id, net_weight: 10, roll_count: 1 }] });
    await expectClean('a pending delivery note');

    // returns
    const salesReturn = await post('/api/returns/sales', { customer_id: customer.id, invoice_id: sale.id, warehouse_id: w1.id, date: '2026-05-14', items: [{ item_id: itemA.id, quantity: 2, weight: 20, price: 15, discount: 0 }] });
    expect(salesReturn.status).toBe(201);
    const purchaseReturn = await post('/api/returns/purchase', { supplier_id: supplier.id, warehouse_id: w1.id, date: '2026-05-14', items: [{ item_id: itemA.id, quantity: 3, weight: 30, price: 10, discount: 0 }] });
    expect(purchaseReturn.status).toBe(201);
    await expectClean('sales and purchase returns');

    // money in and out, a bounced check, an opening balance
    expect((await post('/api/finance/cash-receipts', { customer_id: customer.id, amount: 700, date: '2026-05-15', payment_method: 'نقدي' })).status).toBe(201);
    expect((await post('/api/finance/cash-payments', { supplier_id: supplier.id, amount: 900, date: '2026-05-15', payment_method: 'نقدي' })).status).toBe(201);
    await expectClean('cash receipt and payment');
    const check = await post('/api/finance/checks', { check_no: 'CK-2', party_type: 'customer', party_id: customer.id, amount: 300, date: '2026-05-16', due_date: '2026-06-16' });
    expect(check.status).toBe(201);
    expect((await put(`/api/finance/checks/${check.body.id}`, { status: 'bounced', bounced_date: '2026-06-17' })).status).toBe(200);
    await expectClean('bounced customer check');
    await OpeningBalance.create({ party_type: 'customer', party_id: customer.id, debit: 1000, credit: 0 });
    await OpeningBalance.create({ party_type: 'supplier', party_id: supplier.id, debit: 0, credit: 2500 });
    await expectClean('opening balances');
  });
});

describe('the checker notices tampering', () => {
  const findingsFor = async (code) => (await run([code])).flatMap(r => r.violations.filter(v => v.severity === 'error'));

  test('a posted invoice payment without its receipt', async () => {
    await postSale('SI-X1', [line(itemA, 0, 0, 0)].slice(0, 0).concat([line(service, 1, 0, 1000)]), 400);
    expect(await findingsFor('sales-invoice-payments')).toHaveLength(0);
    await CashReceipt.destroy({ where: { customer_id: customer.id } });
    const found = await findingsFor('sales-invoice-payments');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/SI-X1/);
    // and the customer statement/list now disagree with the invoice's own figures
    expect(errorsOf(await run(['customer-balances'])).length).toBe(0); // the balances themselves stay self-consistent
  });

  test('a stock balance edited by hand', async () => {
    await postPurchase('PI-X1', [line(itemA, 10, 100, 10)]);
    expect(await findingsFor('stock-vs-movements')).toHaveLength(0);
    await Stock.update({ weight: 999 }, { where: { item_id: itemA.id, warehouse_id: w1.id } });
    const found = await findingsFor('stock-vs-movements');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/999/);
  });

  test('a posted invoice whose stock movement is missing', async () => {
    await postPurchase('PI-X2', [line(itemA, 10, 100, 10)]);
    expect(await findingsFor('purchase-invoice-movements')).toHaveLength(0);
    await StockMovement.destroy({ where: { description: 'فاتورة شراء PI-X2' } });
    const found = await findingsFor('purchase-invoice-movements');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/PI-X2/);
  });

  test('a posted invoice with stockable items and no warehouse', async () => {
    await PurchaseInvoice.update({ warehouse_id: null }, { where: { id: (await postPurchase('PI-X3', [line(itemA, 10, 100, 10)])).id } });
    const found = await findingsFor('purchase-invoice-movements');
    expect(found.some(v => /بدون مخزن/.test(v.message))).toBe(true);
  });

  test('a wrong remaining amount', async () => {
    const inv = await postSale('SI-X4', [line(service, 1, 0, 500)]);
    expect(await findingsFor('invoice-remaining')).toHaveLength(0);
    await SalesInvoice.update({ remaining: 123 }, { where: { id: inv.id } });
    expect(await findingsFor('invoice-remaining')).toHaveLength(1);
  });

  test('a delivered note with no invoice', async () => {
    const note = await post('/api/delivery-notes', { customer_id: customer.id, date: '2026-05-12', warehouse_id: w1.id, items: [{ item_id: itemB.id, net_weight: 10, roll_count: 1 }] });
    await models.DeliveryNote.update({ status: 'delivered' }, { where: { id: note.body.id } });
    const found = await findingsFor('delivery-notes');
    expect(found.some(v => /0 فاتورة/.test(v.message))).toBe(true);
  });
});

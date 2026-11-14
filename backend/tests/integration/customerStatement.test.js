const request = require('supertest');
const express = require('express');
const { sequelize, OpeningBalance, SalesInvoice, SalesInvoiceItem, CashReceipt } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeCustomer, makeItem, makeWarehouse } = require('../helpers/fixtures');

const app = express();
app.use(express.json());
app.use('/api/customers', require('../../routes/customers'));

let token, customer, item, warehouse;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });

beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  customer = await makeCustomer();
  item = await makeItem();
  warehouse = await makeWarehouse();
});

async function makePostedInvoice(date, total) {
  const inv = await SalesInvoice.create({
    invoice_no: `SI-${Date.now()}-${Math.random()}`, date, status: 'posted',
    customer_id: customer.id, warehouse_id: warehouse.id, subtotal: total, total, remaining: total,
  });
  await SalesInvoiceItem.create({ invoice_id: inv.id, item_id: item.id, quantity: 1, weight: 1, price: total, total });
  return inv;
}

describe('GET /api/customers/:id/statement', () => {
  test('includes the opening balance in the running balance of every row', async () => {
    await OpeningBalance.create({ party_type: 'customer', party_id: customer.id, debit: 500, credit: 0 });
    await makePostedInvoice('2026-03-01', 200);

    const res = await request(app).get(`/api/customers/${customer.id}/statement`).set(auth());
    expect(res.status).toBe(200);
    const rows = res.body;
    expect(rows[0].isOpening).toBe(true);
    expect(Number(rows[0].balance)).toBe(500);
    expect(Number(rows[rows.length - 1].balance)).toBe(700);
  });

  test('from/to filters restrict the listed rows but the balance still carries forward correctly', async () => {
    await OpeningBalance.create({ party_type: 'customer', party_id: customer.id, debit: 100, credit: 0 });
    await makePostedInvoice('2026-01-15', 200); // before the filter window
    await makePostedInvoice('2026-03-15', 300); // inside the filter window

    const res = await request(app)
      .get(`/api/customers/${customer.id}/statement`)
      .query({ from: '2026-03-01', to: '2026-03-31' })
      .set(auth());

    expect(res.status).toBe(200);
    const rows = res.body;
    // Only the carried-forward opening row plus the one invoice inside the window.
    expect(rows.length).toBe(2);
    expect(rows[0].isOpening).toBe(true);
    expect(Number(rows[0].balance)).toBe(300); // 100 opening + 200 from the invoice before the window
    expect(Number(rows[1].balance)).toBe(600); // + 300 from the in-window invoice
  });

  test('a far-future `from` collapses everything into a single carry-forward row matching the true ending balance', async () => {
    await OpeningBalance.create({ party_type: 'customer', party_id: customer.id, debit: 50, credit: 0 });
    await makePostedInvoice('2026-01-01', 100);
    await makePostedInvoice('2026-06-01', 250);

    const full = await request(app).get(`/api/customers/${customer.id}/statement`).set(auth());
    const finalBalance = Number(full.body[full.body.length - 1].balance);

    const future = await request(app)
      .get(`/api/customers/${customer.id}/statement`)
      .query({ from: '2099-01-01' })
      .set(auth());

    expect(future.body.length).toBe(1);
    expect(Number(future.body[0].balance)).toBe(finalBalance);
  });
});

describe('cash discount receipts', () => {
  test('a cash discount lowers what the customer owes and is labelled as a discount', async () => {
    await makePostedInvoice('2026-03-01', 1000);
    await CashReceipt.create({ receipt_no: 'CR-D1', date: '2026-03-05', amount: 100, customer_id: customer.id, payment_method: 'خصم نقدي' });
    await CashReceipt.create({ receipt_no: 'CR-D2', date: '2026-03-06', amount: 200, customer_id: customer.id, payment_method: 'نقدي' });
    const res = await request(app).get(`/api/customers/${customer.id}/statement`).set(auth());
    const types = res.body.map(r => r.type);
    expect(types).toEqual(['فاتورة بيع', 'خصم نقدي', 'تحصيل']);
    expect(Number(res.body[res.body.length - 1].balance)).toBe(700);
  });
});

describe('GET /api/customers/:id/statement — item stock flag', () => {
  test('every invoice line carries its item\'s is_stockable flag (the rep statement uses it to skip non-stock weight)', async () => {
    const service = await makeItem({ is_stockable: false });
    const inv = await SalesInvoice.create({
      invoice_no: `SI-${Date.now()}-${Math.random()}`, date: '2026-03-01', status: 'posted',
      customer_id: customer.id, warehouse_id: warehouse.id, subtotal: 30, total: 30, remaining: 30,
    });
    await SalesInvoiceItem.create({ invoice_id: inv.id, item_id: item.id, quantity: 1, weight: 2, price: 10, total: 20 });
    await SalesInvoiceItem.create({ invoice_id: inv.id, item_id: service.id, quantity: 1, weight: 1, price: 10, total: 10 });

    const res = await request(app).get(`/api/customers/${customer.id}/statement`).set(auth());
    const lines = res.body.find(r => r.type === 'فاتورة بيع').items;
    const flagOf = (id) => lines.find(l => l.Item.id === id).Item.is_stockable;
    expect(flagOf(item.id)).toBe(true);
    expect(flagOf(service.id)).toBe(false);
  });
});

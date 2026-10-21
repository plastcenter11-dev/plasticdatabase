// Layer 2 of the testing program: blank optional fields.
//
// The forms send '' for an input the user left empty (an unpicked dropdown, an
// empty number box). MySQL rejects '' for a numeric / id / date column, so an
// endpoint that passes the body straight to the model answers 500 ("Incorrect
// integer value: '' for column 'category_id'") instead of treating the field
// as not set. The candidate fields are read from the Sequelize models, so a
// column added later is covered without touching this file.
//
// For every create endpoint (and every edit endpoint that exists) each optional
// numeric / id / date column is sent as '' and as null, one at a time, with an
// otherwise valid body. Every such request must succeed.

const request = require('supertest');
const express = require('express');
const { DataTypes } = require('sequelize');
const models = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const { sequelize } = models;

const app = express();
app.use(express.json());
app.use('/api/items', require('../../routes/items'));
app.use('/api/customers', require('../../routes/customers'));
app.use('/api/suppliers', require('../../routes/suppliers'));
app.use('/api/warehouses', require('../../routes/warehouses'));
app.use('/api/sales-invoices', require('../../routes/salesInvoices'));
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));
app.use('/api/delivery-notes', require('../../routes/deliveryNotes'));
app.use('/api/returns', require('../../routes/returns'));
app.use('/api/finance', require('../../routes/finance'));
app.use('/api/stock', require('../../routes/stock'));
app.use('/api', require('../../routes/settings'));

let token, warehouse, warehouse2, item, customer, supplier, employee;
let counter = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });
const uniq = (prefix) => `${prefix}-${Date.now()}-${++counter}`;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  token = await makeAuthToken();
  warehouse = await makeWarehouse({ name: 'W1' });
  warehouse2 = await makeWarehouse({ name: 'W2' });
  item = await makeItem({ is_stockable: true });
  customer = await makeCustomer();
  supplier = await makeSupplier();
  employee = await models.Employee.create({ name: 'مندوب' });
});

// columns a form can leave blank: numeric / id / date, not required, not an enum or flag
const BLANKABLE = [DataTypes.INTEGER, DataTypes.BIGINT, DataTypes.DECIMAL, DataTypes.FLOAT, DataTypes.DOUBLE, DataTypes.DATE, DataTypes.DATEONLY];
const isBlankable = (attr) => BLANKABLE.some(T => attr.type instanceof T);

function optionalFields(modelName, body) {
  const attrs = models[modelName].rawAttributes;
  return Object.keys(attrs).filter(name => {
    const a = attrs[name];
    if (a.primaryKey || a.allowNull === false) return false;
    if (['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at'].includes(name)) return false;
    if (name in body) return false;
    return isBlankable(a);
  });
}

const line = (extra = {}) => ({ item_id: item.id, quantity: 2, weight: 10, price: 5, discount: 0, total: 50, ...extra });

// each spec: where to POST, which model the header row belongs to, a valid body builder,
// optionally the model of the nested lines and an edit endpoint
const specs = () => [
  { name: 'items', url: '/api/items', model: 'Item', body: () => ({ code: uniq('ITM'), name: 'صنف' }), editUrl: (id) => `/api/items/${id}` },
  { name: 'non-stock items', url: '/api/items', model: 'Item', body: () => ({ code: uniq('NS'), name: 'خدمة', is_stockable: false }) },
  { name: 'customers', url: '/api/customers', model: 'Customer', body: () => ({ name: 'عميل' }), editUrl: (id) => `/api/customers/${id}` },
  { name: 'suppliers', url: '/api/suppliers', model: 'Supplier', body: () => ({ name: 'مورد' }), editUrl: (id) => `/api/suppliers/${id}` },
  { name: 'warehouses', url: '/api/warehouses', model: 'Warehouse', body: () => ({ name: 'مخزن' }), editUrl: (id) => `/api/warehouses/${id}` },
  { name: 'employees', url: '/api/employees', model: 'Employee', body: () => ({ name: 'موظف' }), editUrl: (id) => `/api/employees/${id}` },
  { name: 'categories', url: '/api/categories', model: 'Category', body: () => ({ name: uniq('قسم') }), editUrl: (id) => `/api/categories/${id}` },
  { name: 'item types', url: '/api/item-types', model: 'ItemType', body: () => ({ name: uniq('نوع') }), editUrl: (id) => `/api/item-types/${id}` },
  { name: 'cash receipts', url: '/api/finance/cash-receipts', model: 'CashReceipt', body: () => ({ customer_id: customer.id, amount: 100, date: '2026-05-01' }) },
  { name: 'cash payments', url: '/api/finance/cash-payments', model: 'CashPayment', body: () => ({ supplier_id: supplier.id, amount: 100, date: '2026-05-01' }) },
  { name: 'checks', url: '/api/finance/checks', model: 'Check', body: () => ({ check_no: uniq('CK'), party_type: 'customer', party_id: customer.id, amount: 100, date: '2026-05-01', due_date: '2026-06-01' }) },
  { name: 'expenses', url: '/api/finance/expenses', model: 'Expense', body: () => ({ date: '2026-05-01', description: 'مصروف', amount: 50 }) },
  { name: 'other income', url: '/api/finance/other-income', model: 'OtherIncome', body: () => ({ date: '2026-05-01', description: 'إيراد', amount: 50 }) },
  { name: 'opening balances', url: '/api/opening-balances', model: 'OpeningBalance', body: () => ({ party_type: 'customer', party_id: customer.id }) },
  { name: 'sales invoices', url: '/api/sales-invoices', model: 'SalesInvoice', lineModel: 'SalesInvoiceItem', lineKey: 'items',
    body: () => ({ customer_id: customer.id, invoice_no: uniq('SI'), date: '2026-05-01', items: [line()] }) },
  { name: 'purchase invoices', url: '/api/purchase-invoices', model: 'PurchaseInvoice', lineModel: 'PurchaseInvoiceItem', lineKey: 'items',
    body: () => ({ supplier_id: supplier.id, invoice_no: uniq('PI'), date: '2026-05-01', items: [line()] }) },
  { name: 'delivery notes', url: '/api/delivery-notes', model: 'DeliveryNote', lineModel: 'DeliveryNoteItem', lineKey: 'items',
    body: () => ({ customer_id: customer.id, date: '2026-05-01', items: [{ item_id: item.id, net_weight: 10, roll_count: 1 }] }) },
  { name: 'sales returns', url: '/api/returns/sales', model: 'SalesReturn', lineModel: 'SalesReturnItem', lineKey: 'items',
    body: () => ({ customer_id: customer.id, date: '2026-05-01', items: [line()] }) },
  { name: 'purchase returns', url: '/api/returns/purchase', model: 'PurchaseReturn', lineModel: 'PurchaseReturnItem', lineKey: 'items',
    body: () => ({ supplier_id: supplier.id, date: '2026-05-01', items: [line()] }) },
  { name: 'stock entries', url: '/api/stock/adjustments', model: 'StockMovement',
    body: () => ({ item_id: item.id, warehouse_id: warehouse.id, movement_type: 'إضافة', quantity: 2, weight: 10, date: '2026-05-01' }) },
  { name: 'warehouse transfers', url: '/api/stock/transfers', model: 'WarehouseTransfer', lineModel: 'WarehouseTransferItem', lineKey: 'items',
    body: () => ({ from_warehouse_id: warehouse.id, to_warehouse_id: warehouse2.id, date: '2026-05-01', items: [{ item_id: item.id, quantity: 1, weight: 5 }] }) },
  { name: 'item assemblies', url: '/api/stock/assemblies', model: 'ItemAssembly', lineModel: 'ItemAssemblyComponent', lineKey: 'components',
    body: () => ({ date: '2026-05-01', assembled_item_id: item.id, assembled_qty: 1, assembled_weight: 5, warehouse_id: warehouse.id, output_warehouse_id: warehouse.id,
      components: [{ item_id: item.id, quantity: 1, weight: 5, warehouse_id: warehouse.id }] }) },
];

const BLANKS = ['', null];
const label = (v) => (v === '' ? "''" : String(v));

describe('blank optional fields never produce a server error', () => {
  const failures = [];
  const record = (where, res) => failures.push(`${where} -> ${res.status} ${res.body && res.body.error ? res.body.error : ''}`.trim());

  test('create endpoints accept an empty optional header or line field', async () => {
    for (const spec of specs()) {
      const base = spec.body();
      const baseline = await request(app).post(spec.url).set(auth()).send(base);
      if (![200, 201].includes(baseline.status)) { record(`${spec.name}: the valid body itself failed`, baseline); continue; }

      for (const field of optionalFields(spec.model, base)) {
        for (const blank of BLANKS) {
          const res = await request(app).post(spec.url).set(auth()).send({ ...spec.body(), [field]: blank });
          if (![200, 201].includes(res.status)) record(`POST ${spec.url} ${field}=${label(blank)}`, res);
        }
      }
      if (spec.lineModel) {
        const lineBody = spec.body()[spec.lineKey][0];
        for (const field of optionalFields(spec.lineModel, lineBody)) {
          for (const blank of BLANKS) {
            const body = spec.body();
            body[spec.lineKey][0] = { ...body[spec.lineKey][0], [field]: blank };
            const res = await request(app).post(spec.url).set(auth()).send(body);
            if (![200, 201].includes(res.status)) record(`POST ${spec.url} line.${field}=${label(blank)}`, res);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('edit endpoints accept clearing an optional field', async () => {
    const editFailures = [];
    for (const spec of specs().filter(s => s.editUrl)) {
      const base = spec.body();
      const created = await request(app).post(spec.url).set(auth()).send(base);
      if (created.status !== 201) { editFailures.push(`${spec.name}: could not create the record to edit`); continue; }
      for (const field of optionalFields(spec.model, base)) {
        for (const blank of BLANKS) {
          const res = await request(app).put(spec.editUrl(created.body.id)).set(auth()).send({ ...base, [field]: blank });
          if (res.status !== 200) editFailures.push(`PUT ${spec.editUrl(':id')} ${field}=${label(blank)} -> ${res.status} ${(res.body && res.body.error) || ''}`.trim());
        }
      }
    }
    expect(editFailures).toEqual([]);
  });
});

// The Express app with its real wiring (authentication and the per-module
// permission checks in front of every router). server.js starts it; the tests
// import it, so what they exercise is exactly what the server serves.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { auth, requireModule, requireModuleByPath } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', auth, requireModule('items'), require('./routes/items'));
app.use('/api/warehouses', auth, requireModule('warehouses'), require('./routes/warehouses'));
app.use('/api/customers', auth, requireModule('customers'), require('./routes/customers'));
app.use('/api/suppliers', auth, requireModule('suppliers'), require('./routes/suppliers'));
app.use('/api/delivery-notes', auth, requireModule('delivery_notes'), require('./routes/deliveryNotes'));
app.use('/api/sales-invoices', auth, requireModule('sales_invoices'), require('./routes/salesInvoices'));
app.use('/api/purchase-invoices', auth, requireModule('purchase_invoices'), require('./routes/purchaseInvoices'));
app.use('/api/returns', auth, requireModuleByPath([
  [/^\/purchase/, 'purchase_invoices'],
  [/^\/sales/, 'sales_invoices'],
]), require('./routes/returns'));
app.use('/api/finance', auth, requireModuleByPath([
  [/^\/cash-receipts/, 'cash_receipts'],
  [/^\/cash-payments/, 'cash_payments'],
  [/^\/checks/, 'checks'],
  [/^\/expenses/, 'expenses'],
  [/^\/other-income/, 'other_income'],
]), require('./routes/finance'));
app.use('/api/stock', auth, requireModule('stock'), require('./routes/stock'));
app.use('/api', auth, requireModuleByPath([
  [/^\/employees/, 'employees'],
  [/^\/financial-years/, 'financial_years'],
  [/^\/opening-balances/, 'financial_years'],
  [/^\/settings/, 'settings'],
  [/^\/categories/, 'items'],
  [/^\/item-types/, 'items'],
  [/^\/backup/, 'settings'],
]), require('./routes/settings'));

module.exports = app;

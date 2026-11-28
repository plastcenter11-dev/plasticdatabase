// The Express app with its real wiring (authentication and the per-module
// permission checks in front of every router). server.js starts it; the tests
// import it, so what they exercise is exactly what the server serves.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { auth, adminOnly, requireModule, requireModuleByPath } = require('./middleware/auth');
const { securityHeaders, corsOptions } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (Caddy / nginx) the real client address is in X-Forwarded-For. Only trust it when
// told to (TRUST_PROXY=1), otherwise anyone could fake their address and dodge the sign-in limits.
if (process.env.TRUST_PROXY) app.set('trust proxy', /^[0-9]+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/options', auth, require('./routes/options'));
app.use('/api/audit-logs', auth, adminOnly, require('./routes/audit'));
app.use('/api/integrity', auth, adminOnly, require('./routes/integrity'));
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

// an unknown API address is an error, never the web page
app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

// In production the screens are the built frontend (frontend/dist), served by this same server so the
// browser talks to one address over one HTTPS connection. In development vite serves them instead.
const DIST = process.env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// the last safety net: an unexpected error is logged here and the browser only sees a plain message
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات غير صالحة' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم البيانات كبير' });
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
});

module.exports = app;

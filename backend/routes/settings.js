const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');

// Auto-detect mysql/mysqldump paths
function findMysqlBin(exe) {
  const candidates = [
    `C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\${exe}`,
    `C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\${exe}`,
    `C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\${exe}`,
    `C:\\xampp\\mysql\\bin\\${exe}`,
    `C:\\wamp64\\bin\\mysql\\mysql8.0\\bin\\${exe}`,
    `C:\\wamp64\\bin\\mysql\\mysql5.7\\bin\\${exe}`,
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return exe; // fallback: hope it's in PATH
}

const upload = multer({ dest: os.tmpdir() });
const { User, Employee, FinancialYear, OpeningBalance, Settings, Customer, Supplier, Stock,
  Item, Category, ItemType, Warehouse, SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem,
  SalesInvoice, SalesInvoiceItem, PurchaseInvoice, PurchaseInvoiceItem,
  SalesReturn, SalesReturnItem, PurchaseReturn, PurchaseReturnItem,
  CashReceipt, CashPayment, Check, Expense, OtherIncome,
  StockMovement, WarehouseTransfer, WarehouseTransferItem, ItemAssembly, ItemAssemblyComponent,
} = require('../models');
const { adminOnly } = require('../middleware/auth');
const { clean } = require('../utils/clean');

// Users (admin only — user accounts and permissions must not be viewable/editable by non-admins)
router.get('/users', adminOnly, async (req, res) => {
  try { res.json(await User.findAll({ attributes: { exclude: ['password'] }, order: [['id', 'ASC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// only these fields can be set from outside; the rest (ids, timestamps, the password stamp) are the server's
const USER_FIELDS = ['username', 'password', 'role', 'permissions', 'is_active'];
const pickUser = (body) => Object.fromEntries(USER_FIELDS.filter(k => body && body[k] !== undefined).map(k => [k, body[k]]));
const { MIN_PASSWORD } = require('./auth');

router.post('/users', adminOnly, async (req, res) => {
  try {
    const data = pickUser(req.body);
    if (typeof data.password !== 'string' || data.password.length < MIN_PASSWORD) return res.status(400).json({ error: `كلمة المرور لازم تكون ${MIN_PASSWORD} حروف على الأقل` });
    data.password = await bcrypt.hash(data.password, 10);
    const user = await User.create(data);
    const { password, ...safe } = user.toJSON();
    res.status(201).json(safe);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/users/:id', adminOnly, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    const data = pickUser(req.body);
    // an admin cannot lock themselves out by switching their own account off or demoting it
    if (user.id === req.user.id && (data.is_active === false || (data.role && data.role !== 'admin'))) {
      return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك أو تغيير صلاحيته' });
    }
    if (data.password) {
      if (typeof data.password !== 'string' || data.password.length < MIN_PASSWORD) return res.status(400).json({ error: `كلمة المرور لازم تكون ${MIN_PASSWORD} حروف على الأقل` });
      data.password = await bcrypt.hash(data.password, 10);
      data.password_changed_at = new Date();
    } else delete data.password;
    await user.update(data);
    const { password, ...safe } = user.toJSON();
    res.json(safe);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
    await user.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Employees
router.get('/employees', async (req, res) => {
  try { res.json(await Employee.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/employees', async (req, res) => {
  try { res.status(201).json(await Employee.create(clean(Employee, req.body))); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    await e.update(clean(Employee, req.body));
    res.json(e);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    // an employee tied to invoices (rep/commission) is kept for history: deactivate instead
    if (await require('../models').SalesInvoice.count({ where: { employee_id: e.id } }) > 0) {
      return res.status(400).json({ error: 'لا يمكن حذف هذا الموظف لأن له فواتير مسجلة - يمكنك إلغاء تنشيطه بدلاً من حذفه' });
    }
    await e.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Financial Years
router.get('/financial-years', async (req, res) => {
  try { res.json(await FinancialYear.findAll({ order: [['start_date', 'ASC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/financial-years', async (req, res) => {
  try { res.status(201).json(await FinancialYear.create(clean(FinancialYear, req.body))); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/financial-years/:id', async (req, res) => {
  try {
    const y = await FinancialYear.findByPk(req.params.id);
    if (!y) return res.status(404).json({ error: 'غير موجود' });
    await y.update(clean(FinancialYear, req.body));
    res.json(y);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/financial-years/:id/activate', async (req, res) => {
  try {
    await FinancialYear.update({ is_active: false }, { where: {} });
    const y = await FinancialYear.findByPk(req.params.id);
    await y.update({ is_active: true });
    res.json({ message: 'تم التنشيط' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/financial-years/:id/close', async (req, res) => {
  try {
    const { next_year_id } = req.body;
    const current = await FinancialYear.findByPk(req.params.id);
    const next = await FinancialYear.findByPk(next_year_id);
    if (!current || !next) return res.status(404).json({ error: 'سنة غير موجودة' });

    // Customer/supplier balances are a continuous running total (all posted
    // invoices/returns/receipts/payments/checks ever, plus each party's
    // one-time opening balance) - it already carries forward correctly on
    // its own. Closing a year does NOT insert a fresh opening-balance
    // snapshot here: doing so would double-count everything that snapshot
    // was computed from, since the running total keeps summing the same
    // history anyway. Closing only locks the year's documents (enforced via
    // closedYearError on every financial document route) and switches which
    // year is "active" for new documents.
    await current.update({ is_active: false, is_closed: true });
    await next.update({ is_active: true });
    res.json({ message: `تم إقفال ${current.name} وتنشيط ${next.name}` });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/financial-years/:id/reopen', async (req, res) => {
  try {
    const y = await FinancialYear.findByPk(req.params.id);
    if (!y) return res.status(404).json({ error: 'غير موجود' });
    await y.update({ is_closed: false });
    res.json({ message: `تم إعادة فتح ${y.name}` });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/financial-years/:id', async (req, res) => {
  try {
    const y = await FinancialYear.findByPk(req.params.id);
    if (!y) return res.status(404).json({ error: 'غير موجود' });
    if (y.is_active) return res.status(400).json({ error: 'لا يمكن حذف السنة النشطة' });
    await y.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Opening Balances
router.get('/opening-balances', async (req, res) => {
  try { res.json(await OpeningBalance.findAll({ include: [FinancialYear], order: [['id', 'DESC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/opening-balances', async (req, res) => {
  try { res.status(201).json(await OpeningBalance.create(clean(OpeningBalance, req.body))); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/opening-balances/:id', async (req, res) => {
  try {
    const ob = await OpeningBalance.findByPk(req.params.id);
    if (!ob) return res.status(404).json({ error: 'غير موجود' });
    await ob.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await Settings.findAll();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/settings', adminOnly, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await Settings.upsert({ key, value });
    }
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Categories
router.get('/categories', async (req, res) => {
  try { res.json(await require('../models').Category.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/categories', async (req, res) => {
  try { res.status(201).json(await require('../models').Category.create(clean(require('../models').Category, req.body))); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const c = await require('../models').Category.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: 'غير موجود' });
    await c.update(clean(require("../models").Category, req.body));
    res.json(c);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/categories/:id', async (req, res) => {
  try { await require('../models').Category.destroy({ where: { id: req.params.id } }); res.json({ message: 'تم الحذف' }); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/item-types', async (req, res) => {
  try { res.json(await ItemType.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/item-types', async (req, res) => {
  try { res.status(201).json(await ItemType.create(clean(ItemType, req.body))); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/item-types/:id', async (req, res) => {
  try {
    const t = await ItemType.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: 'غير موجود' });
    await t.update(clean(ItemType, req.body));
    res.json(t);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/item-types/:id', async (req, res) => {
  try { await ItemType.destroy({ where: { id: req.params.id } }); res.json({ message: 'تم الحذف' }); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// Restore — import .sql file via mysql
// Second copy of the daily backup (a USB drive, a synced cloud folder, a network share), picked
// from inside the program. The place is saved in Settings; the daily job (scripts/backup.js)
// reads it and records how its last copy went.
const backupCopy = require('../utils/backupCopy');
const readSetting = async (key) => (await Settings.findOne({ where: { key } }))?.value || '';

router.get('/backup/copy', adminOnly, async (req, res) => {
  try {
    const saved = await readSetting(backupCopy.KEY_DIR);
    const fromEnv = (process.env.BACKUP_COPY_DIR || '').trim();
    const dir = saved || fromEnv;
    let last = null;
    try { last = JSON.parse(await readSetting(backupCopy.KEY_LAST) || 'null'); } catch { last = null; }
    res.json({ dir, source: saved ? 'setting' : (fromEnv ? 'env' : 'none'), check: dir ? backupCopy.checkFolder(dir) : null, last });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/backup/copy', adminOnly, async (req, res) => {
  try {
    const dir = String(req.body?.dir || '').trim();
    if (dir) {
      const check = backupCopy.checkFolder(dir);
      if (!check.ok) return res.status(400).json({ error: check.message });
    }
    await Settings.upsert({ key: backupCopy.KEY_DIR, value: dir });
    res.json({ dir, check: dir ? backupCopy.checkFolder(dir) : null });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

// folders (never files) of a path for the folder picker; no path = the drives
router.get('/backup/browse', adminOnly, (req, res) => {
  try { res.json(backupCopy.browse(req.query.path)); }
  catch { res.status(400).json({ error: 'لا يمكن فتح هذا المكان' }); }
});

// take a backup now (same script as the daily job), including the second copy
router.post('/backup/run', adminOnly, (req, res) => {
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'backup.js')], { cwd: path.join(__dirname, '..') });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  child.on('error', err => res.status(500).json({ error: err.message }));
  child.on('close', code => res.json({ ok: code === 0, output: output.trim() }));
});

router.post('/backup/restore', adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const mysql = findMysqlBin('mysql.exe');
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;

  const args = [
    `--host=${DB_HOST}`,
    `--user=${DB_USER}`,
    `--password=${DB_PASS}`,
    DB_NAME,
  ];

  const proc = require('child_process').spawn(mysql, args);
  const fileStream = fs.createReadStream(req.file.path);
  fileStream.pipe(proc.stdin);

  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });

  proc.on('close', (code) => {
    fs.unlink(req.file.path, () => {});
    if (code === 0) {
      res.json({ message: 'تم استعادة قاعدة البيانات بنجاح' });
    } else {
      // mysqldump prints warnings to stderr even on success — filter real errors
      const realError = stderr.split('\n').find(l => l.toLowerCase().includes('error'));
      if (realError) res.status(500).json({ error: realError });
      else res.json({ message: 'تم استعادة قاعدة البيانات بنجاح' });
    }
  });

  proc.on('error', (err) => {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: `تعذر تشغيل mysql: ${err.message}` });
  });
});

// Backup — SQL dump via mysqldump
router.get('/backup/sql', adminOnly, async (req, res) => {
  const mysqldump = findMysqlBin('mysqldump.exe');
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
  const date = new Date().toISOString().split('T')[0];
  const filename = `plasticdb-backup-${date}.sql`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  const args = [
    `--host=${DB_HOST}`,
    `--user=${DB_USER}`,
    `--password=${DB_PASS}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    DB_NAME,
  ];

  const proc = require('child_process').spawn(mysqldump, args);
  proc.stdout.pipe(res);
  proc.stderr.on('data', () => {}); // suppress warnings
  proc.on('error', (err) => {
    if (!res.headersSent) res.status(errorStatus(err)).json({ error: describeError(err) });
  });
});

// Backup — export all tables as JSON
router.get('/backup', adminOnly, async (req, res) => {
  try {
    const safe = m => m ? m.findAll() : Promise.resolve([]);
    const [
      users, employees, categories, warehouses, items,
      customers, suppliers, financialYears, openingBalances, settings,
      salesOrders, salesOrderItems, deliveryNotes, deliveryNoteItems,
      salesInvoices, salesInvoiceItems, purchaseInvoices, purchaseInvoiceItems,
      salesReturns, salesReturnItems, purchaseReturns, purchaseReturnItems,
      cashReceipts, cashPayments, checks, expenses, otherIncome,
      stock, stockMovements, warehouseTransfers, warehouseTransferItems,
      itemAssemblies, itemAssemblyComponents,
    ] = await Promise.all([
      User.findAll(),
      safe(Employee), safe(Category), safe(Warehouse), safe(Item),
      safe(Customer), safe(Supplier), safe(FinancialYear), safe(OpeningBalance), Settings.findAll(),
      safe(SalesOrder), safe(SalesOrderItem), safe(DeliveryNote), safe(DeliveryNoteItem),
      safe(SalesInvoice), safe(SalesInvoiceItem), safe(PurchaseInvoice), safe(PurchaseInvoiceItem),
      safe(SalesReturn), safe(SalesReturnItem), safe(PurchaseReturn), safe(PurchaseReturnItem),
      safe(CashReceipt), safe(CashPayment), safe(Check), safe(Expense), safe(OtherIncome),
      safe(Stock), safe(StockMovement), safe(WarehouseTransfer), safe(WarehouseTransferItem),
      safe(ItemAssembly), safe(ItemAssemblyComponent),
    ]);

    const backup = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      tables: {
        users, employees, categories, warehouses, items,
        customers, suppliers, financialYears, openingBalances, settings,
        salesOrders, salesOrderItems, deliveryNotes, deliveryNoteItems,
        salesInvoices, salesInvoiceItems, purchaseInvoices, purchaseInvoiceItems,
        salesReturns, salesReturnItems, purchaseReturns, purchaseReturnItems,
        cashReceipts, cashPayments, checks, expenses, otherIncome,
        stock, stockMovements, warehouseTransfers, warehouseTransferItems,
        itemAssemblies, itemAssemblyComponents,
      },
    };

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="plasticdb-backup-${date}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(backup);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

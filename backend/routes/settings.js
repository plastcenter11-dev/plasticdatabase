const router = require('express').Router();
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

// Users
router.get('/users', async (req, res) => {
  try { res.json(await User.findAll({ attributes: { exclude: ['password'] }, order: [['id', 'ASC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  try {
    req.body.password = await bcrypt.hash(req.body.password, 10);
    const user = await User.create(req.body);
    const { password, ...safe } = user.toJSON();
    res.status(201).json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (req.body.password) req.body.password = await bcrypt.hash(req.body.password, 10);
    await user.update(req.body);
    const { password, ...safe } = user.toJSON();
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    await user.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Employees
router.get('/employees', async (req, res) => {
  try { res.json(await Employee.findAll({ order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/employees', async (req, res) => {
  try { res.status(201).json(await Employee.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    await e.update(req.body);
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const e = await Employee.findByPk(req.params.id);
    if (!e) return res.status(404).json({ error: 'غير موجود' });
    await e.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Financial Years
router.get('/financial-years', async (req, res) => {
  try { res.json(await FinancialYear.findAll({ order: [['start_date', 'ASC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/financial-years', async (req, res) => {
  try { res.status(201).json(await FinancialYear.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/financial-years/:id', async (req, res) => {
  try {
    const y = await FinancialYear.findByPk(req.params.id);
    if (!y) return res.status(404).json({ error: 'غير موجود' });
    await y.update(req.body);
    res.json(y);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/financial-years/:id/activate', async (req, res) => {
  try {
    await FinancialYear.update({ is_active: false }, { where: {} });
    const y = await FinancialYear.findByPk(req.params.id);
    await y.update({ is_active: true });
    res.json({ message: 'تم التنشيط' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/financial-years/:id/close', async (req, res) => {
  try {
    const { next_year_id } = req.body;
    const current = await FinancialYear.findByPk(req.params.id);
    const next = await FinancialYear.findByPk(next_year_id);
    if (!current || !next) return res.status(404).json({ error: 'سنة غير موجودة' });

    // Transfer customer balances
    const customers = await Customer.findAll({ where: { balance: { [require('sequelize').Op.ne]: 0 } } });
    for (const c of customers) {
      await OpeningBalance.create({ party_type: 'customer', party_id: c.id, debit: Number(c.balance) > 0 ? c.balance : 0, credit: Number(c.balance) < 0 ? Math.abs(c.balance) : 0, financial_year_id: next.id });
    }

    // Transfer supplier balances
    const suppliers = await Supplier.findAll({ where: { balance: { [require('sequelize').Op.ne]: 0 } } });
    for (const s of suppliers) {
      await OpeningBalance.create({ party_type: 'supplier', party_id: s.id, debit: Number(s.balance) < 0 ? Math.abs(s.balance) : 0, credit: Number(s.balance) > 0 ? s.balance : 0, financial_year_id: next.id });
    }

    await current.update({ is_active: false, is_closed: true });
    await next.update({ is_active: true });
    res.json({ message: `تم إقفال ${current.name} وتنشيط ${next.name}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/financial-years/:id', async (req, res) => {
  try {
    const y = await FinancialYear.findByPk(req.params.id);
    if (!y) return res.status(404).json({ error: 'غير موجود' });
    if (y.is_active) return res.status(400).json({ error: 'لا يمكن حذف السنة النشطة' });
    await y.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Opening Balances
router.get('/opening-balances', async (req, res) => {
  try { res.json(await OpeningBalance.findAll({ include: [FinancialYear], order: [['id', 'DESC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/opening-balances', async (req, res) => {
  try { res.status(201).json(await OpeningBalance.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/opening-balances/:id', async (req, res) => {
  try {
    const ob = await OpeningBalance.findByPk(req.params.id);
    if (!ob) return res.status(404).json({ error: 'غير موجود' });
    await ob.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await Settings.findAll();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await Settings.upsert({ key, value });
    }
    res.json({ message: 'تم الحفظ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Categories
router.get('/categories', async (req, res) => {
  try { res.json(await require('../models').Category.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', async (req, res) => {
  try { res.status(201).json(await require('../models').Category.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/item-types', async (req, res) => {
  try { res.json(await ItemType.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/item-types', async (req, res) => {
  try { res.status(201).json(await ItemType.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/item-types/:id', async (req, res) => {
  try { await ItemType.destroy({ where: { id: req.params.id } }); res.json({ message: 'تم الحذف' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Restore — import .sql file via mysql
router.post('/backup/restore', upload.single('file'), async (req, res) => {
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
router.get('/backup/sql', async (req, res) => {
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
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
});

// Backup — export all tables as JSON
router.get('/backup', async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

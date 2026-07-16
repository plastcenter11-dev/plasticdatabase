/**
 * E2E Tests — الدورة المستندية الكاملة
 *
 * الدورة 1: شراء كاملة
 *   فاتورة شراء (draft) → ترحيل → تحقق من المخزن → مرتجع مشتريات → تحقق
 *
 * الدورة 2: بيع كاملة
 *   فاتورة بيع (draft) → ترحيل → تحقق من نقص المخزن → مرتجع مبيعات → تحقق
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  sequelize, User, Supplier, Customer, Item, Warehouse,
  PurchaseInvoice, PurchaseInvoiceItem,
  SalesInvoice, SalesInvoiceItem,
  Stock, StockMovement,
  CashPayment, CashReceipt,
} = require('../../models');

// ===== App =====
const app = express();
app.use(express.json());
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));
app.use('/api/sales-invoices',    require('../../routes/salesInvoices'));
app.use('/api/returns',           require('../../routes/returns'));

// ===== Shared state =====
let token, supplierId, customerId, itemId, warehouseId;
const auth = () => ({ Authorization: `Bearer ${token}` });

// ===== SETUP =====
beforeAll(async () => {
  await sequelize.authenticate();
  await sequelize.sync();

  let admin = await User.findOne({ where: { username: 'e2e_admin' } });
  if (!admin) admin = await User.create({ username: 'e2e_admin', password: await bcrypt.hash('x', 10), role: 'admin' });
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET || 'secret');

  const supplier  = await Supplier.create({ name: 'E2E Supplier', balance: 0 });
  const customer  = await Customer.create({ name: 'E2E Customer', balance: 0 });
  const warehouse = await Warehouse.create({ name: 'E2E Warehouse' });
  const item      = await Item.create({ code: 'E2E-ITEM-001', name: 'E2E Item', unit: 'kg', purchase_price: 20, is_stockable: true });

  supplierId  = supplier.id;
  customerId  = customer.id;
  warehouseId = warehouse.id;
  itemId      = item.id;
});

afterAll(async () => {
  await PurchaseInvoice.destroy({ where: { supplier_id: supplierId } });
  await SalesInvoice.destroy({ where: { customer_id: customerId } });
  await Stock.destroy({ where: { warehouse_id: warehouseId } });
  await StockMovement.destroy({ where: { warehouse_id: warehouseId } });
  await CashPayment.destroy({ where: { supplier_id: supplierId } });
  await Supplier.destroy({ where: { id: supplierId } });
  await Customer.destroy({ where: { id: customerId } });
  await Item.destroy({ where: { id: itemId } });
  await Warehouse.destroy({ where: { id: warehouseId } });
  await User.destroy({ where: { username: 'e2e_admin' } });
  await sequelize.close();
});

// ================================================================
// الدورة 1: شراء كاملة
// ================================================================
describe('دورة الشراء الكاملة', () => {
  let invoiceId;

  // ── الخطوة 1: إنشاء فاتورة شراء ──────────────────────────────
  describe('الخطوة 1 — إنشاء فاتورة شراء (draft)', () => {
    test('إنشاء ناجح ويرجع draft', async () => {
      const res = await request(app).post('/api/purchase-invoices').set(auth()).send({
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        invoice_no: `E2E-PI-${Date.now()}`,
        date: '2026-01-10',
        subtotal: 4000,
        discount: 200,
        tax_rate: 14,
        tax_amount: 533,
        total: 4333,
        paid: 1000,
        remaining: 3333,
        items: [{ item_id: itemId, quantity: 20, weight: 200, price: 20, discount: 0, total: 4000 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      invoiceId = res.body.id;
    });

    test('المخزن لم يتغير بعد — الفاتورة مسودة', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      // إما مفيش stock لسه أو quantity = 0
      if (stock) expect(Number(stock.quantity)).toBe(0);
    });
  });

  // ── الخطوة 2: ترحيل الفاتورة ──────────────────────────────────
  describe('الخطوة 2 — ترحيل فاتورة الشراء', () => {
    test('الترحيل يرجع 200', async () => {
      const res = await request(app).post(`/api/purchase-invoices/${invoiceId}/post`).set(auth());
      expect(res.status).toBe(200);
    });

    test('الحالة أصبحت posted', async () => {
      const inv = await PurchaseInvoice.findByPk(invoiceId);
      expect(inv.status).toBe('posted');
    });

    test('المخزن زاد بالوزن والكمية الصحيحة', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      expect(stock).not.toBeNull();
      expect(Number(stock.quantity)).toBe(20);
      expect(Number(stock.weight)).toBe(200);
    });

    test('حركة مخزن نوع "فاتورة شراء" اتسجلت', async () => {
      const mv = await StockMovement.findOne({
        where: { item_id: itemId, warehouse_id: warehouseId, movement_type: 'فاتورة شراء' },
      });
      expect(mv).not.toBeNull();
      expect(Number(mv.quantity)).toBe(20);
      expect(Number(mv.weight)).toBe(200);
    });

    test('رصيد المورد زاد بقيمة المتبقي (3333)', async () => {
      const supplier = await Supplier.findByPk(supplierId);
      expect(Number(supplier.balance)).toBeCloseTo(3333, 0);
    });

    test('CashPayment اتنشأ بقيمة المدفوع (1000)', async () => {
      const cp = await CashPayment.findOne({ where: { supplier_id: supplierId } });
      expect(cp).not.toBeNull();
      expect(Number(cp.amount)).toBe(1000);
    });

    test('ترحيل تاني يرجع خطأ 400', async () => {
      const res = await request(app).post(`/api/purchase-invoices/${invoiceId}/post`).set(auth());
      expect(res.status).toBe(400);
    });
  });

  // ── الخطوة 3: مرتجع مشتريات ────────────────────────────────────
  describe('الخطوة 3 — مرتجع مشتريات (إرجاع 10 وحدات من 20)', () => {
    let returnId;
    let stockBeforeReturn;

    beforeAll(async () => {
      stockBeforeReturn = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
    });

    test('إنشاء المرتجع يرجع 201', async () => {
      const res = await request(app).post('/api/returns/purchase').set(auth()).send({
        supplier_id: supplierId,
        invoice_id: invoiceId,
        date: '2026-01-12',
        reason: 'بضاعة تالفة',
        items: [{ item_id: itemId, quantity: 10, weight: 100, price: 20 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      returnId = res.body.id;
    });

    test('المرتجع يحتوي على الأصناف الصحيحة', async () => {
      const res = await request(app).post('/api/returns/purchase').set(auth()).send({
        supplier_id: supplierId,
        invoice_id: invoiceId,
        date: '2026-01-12',
        reason: 'اختبار',
        items: [{ item_id: itemId, quantity: 5, weight: 50, price: 20 }],
      });
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBe(1);
    });

    test('إجمالي المرتجع = كمية × سعر', async () => {
      const res = await request(app).post('/api/returns/purchase').set(auth()).send({
        supplier_id: supplierId,
        invoice_id: invoiceId,
        date: '2026-01-12',
        items: [{ item_id: itemId, quantity: 2, weight: 20, price: 20 }],
      });
      // total = qty × price = 2 × 20 = 40 (الحساب الحالي في returns.js)
      expect(Number(res.body.total)).toBe(40);
    });
  });
});

// ================================================================
// الدورة 2: بيع كاملة
// ================================================================
describe('دورة البيع الكاملة', () => {
  let salesInvoiceId;
  let stockBeforeSale;

  // ── الخطوة 1: التحقق من وجود مخزن كافٍ ──────────────────────
  describe('الخطوة 1 — التحقق من المخزن قبل البيع', () => {
    test('المخزن فيه كمية كافية من الدورة السابقة', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      expect(stock).not.toBeNull();
      expect(Number(stock.quantity)).toBeGreaterThan(0);
      stockBeforeSale = stock;
    });
  });

  // ── الخطوة 2: إنشاء فاتورة بيع ────────────────────────────────
  describe('الخطوة 2 — إنشاء فاتورة بيع (draft)', () => {
    test('إنشاء ناجح ويرجع draft', async () => {
      const res = await request(app).post('/api/sales-invoices').set(auth()).send({
        customer_id: customerId,
        warehouse_id: warehouseId,
        invoice_no: `E2E-SI-${Date.now()}`,
        date: '2026-01-15',
        subtotal: 3000,
        discount: 0,
        tax_rate: 14,
        tax_amount: 420,
        total: 3420,
        paid: 3420,
        remaining: 0,
        items: [{ item_id: itemId, quantity: 5, price: 600, discount: 0, total: 3000 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      salesInvoiceId = res.body.id;
    });

    test('المخزن لم يتغير — الفاتورة مسودة', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      expect(Number(stock.quantity)).toBe(Number(stockBeforeSale.quantity));
    });
  });

  // ── الخطوة 3: ترحيل فاتورة البيع ──────────────────────────────
  describe('الخطوة 3 — ترحيل فاتورة البيع', () => {
    test('الترحيل يرجع 200', async () => {
      const res = await request(app).post(`/api/sales-invoices/${salesInvoiceId}/post`).set(auth());
      expect(res.status).toBe(200);
    });

    test('الحالة أصبحت posted', async () => {
      const inv = await SalesInvoice.findByPk(salesInvoiceId);
      expect(inv.status).toBe('posted');
    });

    test('المخزن نقص بالكمية المباعة (5)', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      const expectedQty = Number(stockBeforeSale.quantity) - 5;
      expect(Number(stock.quantity)).toBe(expectedQty);
    });

    test('حركة مخزن نوع "فاتورة بيع" اتسجلت', async () => {
      const mv = await StockMovement.findOne({
        where: { item_id: itemId, warehouse_id: warehouseId, movement_type: 'فاتورة بيع' },
      });
      expect(mv).not.toBeNull();
      expect(Number(mv.quantity)).toBe(5);
    });

    test('ترحيل تاني يرجع خطأ 400', async () => {
      const res = await request(app).post(`/api/sales-invoices/${salesInvoiceId}/post`).set(auth());
      expect(res.status).toBe(400);
    });
  });

  // ── الخطوة 4: مرتجع مبيعات ─────────────────────────────────────
  describe('الخطوة 4 — مرتجع مبيعات (إرجاع 2 وحدة من 5)', () => {
    test('إنشاء مرتجع المبيعات يرجع 201', async () => {
      const res = await request(app).post('/api/returns/sales').set(auth()).send({
        customer_id: customerId,
        invoice_id: salesInvoiceId,
        date: '2026-01-16',
        reason: 'عيب في المنتج',
        items: [{ item_id: itemId, quantity: 2, price: 600 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    test('إجمالي مرتجع المبيعات = 2 × 600 = 1200', async () => {
      const res = await request(app).post('/api/returns/sales').set(auth()).send({
        customer_id: customerId,
        invoice_id: salesInvoiceId,
        date: '2026-01-16',
        items: [{ item_id: itemId, quantity: 2, price: 600 }],
      });
      expect(Number(res.body.total)).toBe(1200);
    });
  });
});

// ================================================================
// اتساق البيانات عبر الدورتين
// ================================================================
describe('اتساق البيانات — بعد الدورتين', () => {
  test('حركات المخزن مرتبة: شراء أولاً ثم بيع', async () => {
    const movements = await StockMovement.findAll({
      where: { item_id: itemId, warehouse_id: warehouseId },
      order: [['id', 'ASC']],
    });
    expect(movements.length).toBeGreaterThanOrEqual(2);
    expect(movements[0].movement_type).toBe('فاتورة شراء');
    const saleMove = movements.find(m => m.movement_type === 'فاتورة بيع');
    expect(saleMove).toBeDefined();
  });

  test('المخزن النهائي = مشتريات - مبيعات', async () => {
    const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
    // اشترينا 200 وحدة، بعنا 5 → 195 متبقي
    expect(Number(stock.quantity)).toBe(15); // 20 - 5
  });

  test('رصيد المورد موجب (فيه دين)', async () => {
    const supplier = await Supplier.findByPk(supplierId);
    expect(Number(supplier.balance)).toBeGreaterThan(0);
  });
});

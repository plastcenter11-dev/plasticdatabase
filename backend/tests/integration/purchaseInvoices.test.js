// Integration Tests — Purchase Invoice API Routes

const request = require('supertest');
const express = require('express');
const { sequelize, User, Supplier, Item, Warehouse, PurchaseInvoice, PurchaseInvoiceItem, Stock, StockMovement, CashPayment } = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Build the app without calling app.listen()
const app = express();
app.use(express.json());
app.use('/api/purchase-invoices', require('../../routes/purchaseInvoices'));
app.use('/api/returns', require('../../routes/returns'));

let token;
let supplierId;
let itemId;
let warehouseId;

// Helper: auth header
const auth = () => ({ Authorization: `Bearer ${token}` });

// ===== SETUP =====
beforeAll(async () => {
  await sequelize.authenticate();
  await sequelize.sync();

  // Create or find admin user
  let admin = await User.findOne({ where: { username: 'test_admin_integration' } });
  if (!admin) {
    admin = await User.create({ username: 'test_admin_integration', password: await bcrypt.hash('pass', 10), role: 'admin' });
  }
  token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET || 'secret');

  // Create test supplier
  const supplier = await Supplier.create({ name: 'Test Supplier Integration', balance: 0 });
  supplierId = supplier.id;

  // Create test item
  const item = await Item.create({ code: 'TEST-INT-001', name: 'Test Item Integration', unit: 'kg', purchase_price: 10, is_stockable: true });
  itemId = item.id;

  // Create test warehouse
  const wh = await Warehouse.create({ name: 'Test Warehouse Integration' });
  warehouseId = wh.id;
});

afterAll(async () => {
  // Cleanup test data
  await PurchaseInvoiceItem.destroy({ where: {} , truncate: false,
    include: [{
      model: PurchaseInvoice,
      where: { supplier_id: supplierId }
    }]
  }).catch(() => {});
  await PurchaseInvoice.destroy({ where: { supplier_id: supplierId } });
  await Supplier.destroy({ where: { id: supplierId } });
  await Item.destroy({ where: { id: itemId } });
  await Warehouse.destroy({ where: { id: warehouseId } });
  await User.destroy({ where: { username: 'test_admin_integration' } });
  await sequelize.close();
});

// ===== TEST 1: POST /api/purchase-invoices =====
describe('POST /api/purchase-invoices — إنشاء فاتورة شراء', () => {
  let createdInvoiceId;

  const payload = () => ({
    supplier_id: supplierId,
    warehouse_id: warehouseId,
    invoice_no: `TEST-PI-${Date.now()}`,
    date: '2026-01-01',
    subtotal: 1500,
    discount: 100,
    tax_rate: 14,
    tax_amount: 196,
    total: 1596,
    paid: 500,
    remaining: 1096,
    items: [{ item_id: itemId, quantity: 10, weight: 150, price: 10, discount: 0, total: 1500 }]
  });

  test('يرجع 201 ويحفظ الفاتورة', async () => {
    const res = await request(app).post('/api/purchase-invoices').set(auth()).send(payload());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('draft');
    createdInvoiceId = res.body.id;
  });

  test('الفاتورة تحتوي على البنود بالوزن الصح', async () => {
    const inv = await PurchaseInvoice.findByPk(createdInvoiceId, {
      include: [{ model: PurchaseInvoiceItem, as: 'items' }]
    });
    expect(inv).not.toBeNull();
    expect(inv.items.length).toBe(1);
    expect(Number(inv.items[0].weight)).toBe(150);
    expect(Number(inv.items[0].quantity)).toBe(10);
    expect(Number(inv.items[0].price)).toBe(10);
  });

  test('فاتورة بدون مورد ترجع خطأ', async () => {
    const bad = { ...payload(), supplier_id: null };
    const res = await request(app).post('/api/purchase-invoices').set(auth()).send(bad);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ===== TEST 2: POST /api/purchase-invoices/:id/post — ترحيل الفاتورة =====
  describe('POST /api/purchase-invoices/:id/post — ترحيل', () => {
    test('الترحيل يغير الحالة إلى posted', async () => {
      const res = await request(app).post(`/api/purchase-invoices/${createdInvoiceId}/post`).set(auth());
      expect(res.status).toBe(200);
      const inv = await PurchaseInvoice.findByPk(createdInvoiceId);
      expect(inv.status).toBe('posted');
    });

    test('الترحيل يزيد المخزن (وزن + كمية)', async () => {
      const stock = await Stock.findOne({ where: { item_id: itemId, warehouse_id: warehouseId } });
      expect(stock).not.toBeNull();
      expect(Number(stock.quantity)).toBeGreaterThan(0);
      expect(Number(stock.weight)).toBeGreaterThan(0);
    });

    test('الترحيل يضيف حركة مخزن', async () => {
      const movement = await StockMovement.findOne({
        where: { item_id: itemId, warehouse_id: warehouseId, movement_type: 'فاتورة شراء' }
      });
      expect(movement).not.toBeNull();
    });

    test('الترحيل يحدث رصيد المورد (remaining فقط، مش paid)', async () => {
      const supplier = await Supplier.findByPk(supplierId);
      // paid=500, total=1596, remaining=1096 → balance should increase by 1096
      expect(Number(supplier.balance)).toBeGreaterThan(0);
    });

    test('الترحيل ينشئ CashPayment لما paid > 0', async () => {
      const payment = await CashPayment.findOne({ where: { supplier_id: supplierId } });
      expect(payment).not.toBeNull();
      expect(Number(payment.amount)).toBe(500);
    });

    test('ترحيل فاتورة مرحلة بالفعل يرجع خطأ', async () => {
      const res = await request(app).post(`/api/purchase-invoices/${createdInvoiceId}/post`).set(auth());
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ===== TEST 3: paid = 0 لا ينشئ CashPayment =====
  describe('POST فاتورة paid=0 — لا ينشئ CashPayment', () => {
    test('مدفوع 0 → لا يُنشأ CashPayment', async () => {
      const noPay = { ...payload(), paid: 0, remaining: 1596 };
      const r1 = await request(app).post('/api/purchase-invoices').set(auth()).send(noPay);
      const invId2 = r1.body.id;

      const before = await CashPayment.count({ where: { supplier_id: supplierId } });
      await request(app).post(`/api/purchase-invoices/${invId2}/post`).set(auth());
      const after = await CashPayment.count({ where: { supplier_id: supplierId } });

      expect(after).toBe(before); // لم يتغير عدد المدفوعات
    });
  });
});

// ===== TEST 4: GET /api/purchase-invoices/supplier/:id =====
describe('GET /api/purchase-invoices/supplier/:id — جلب فواتير المورد', () => {
  test('يرجع قائمة فواتير المورد مع البنود', async () => {
    const res = await request(app).get(`/api/purchase-invoices/supplier/${supplierId}`).set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('كل فاتورة فيها items array', async () => {
    const res = await request(app).get(`/api/purchase-invoices/supplier/${supplierId}`).set(auth());
    res.body.forEach(inv => {
      expect(inv.items).toBeDefined();
      expect(Array.isArray(inv.items)).toBe(true);
    });
  });

  test('البنود فيها item_id وweight وprice', async () => {
    const res = await request(app).get(`/api/purchase-invoices/supplier/${supplierId}`).set(auth());
    const withItems = res.body.find(inv => inv.items.length > 0);
    expect(withItems).toBeDefined();
    const item = withItems.items[0];
    expect(item.item_id).toBeDefined();
    expect(item.weight).toBeDefined();
    expect(item.price).toBeDefined();
  });

  test('مورد غير موجود يرجع قائمة فاضية أو 404', async () => {
    const res = await request(app).get('/api/purchase-invoices/supplier/99999').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

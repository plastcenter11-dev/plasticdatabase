const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Warehouse, Item, Customer, Supplier } = require('../../models');

async function makeAuthToken() {
  const admin = await User.create({ username: `admin_${Date.now()}_${Math.random()}`, password: await bcrypt.hash('pass', 10), role: 'admin' });
  return jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET || 'secret');
}

async function makeWarehouse(overrides = {}) {
  return Warehouse.create({ name: 'مخزن اختبار', ...overrides });
}

async function makeItem(overrides = {}) {
  return Item.create({
    code: `T-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: 'صنف اختبار', unit: 'كجم', purchase_price: 10, sale_price: 15, is_stockable: true,
    ...overrides,
  });
}

async function makeCustomer(overrides = {}) {
  return Customer.create({ name: 'عميل اختبار', balance: 0, ...overrides });
}

async function makeSupplier(overrides = {}) {
  return Supplier.create({ name: 'مورد اختبار', balance: 0, ...overrides });
}

module.exports = { makeAuthToken, makeWarehouse, makeItem, makeCustomer, makeSupplier };

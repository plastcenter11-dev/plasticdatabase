const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'user'), defaultValue: 'user' },
  permissions: { type: DataTypes.JSON, defaultValue: {} },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Warehouse = sequelize.define('Warehouse', {
  name: { type: DataTypes.STRING, allowNull: false },
  location: { type: DataTypes.STRING, defaultValue: '' },
});

const Category = sequelize.define('Category', {
  name: { type: DataTypes.STRING, allowNull: false },
  parent_id: { type: DataTypes.INTEGER, allowNull: true },
});

const ItemType = sequelize.define('ItemType', {
  name: { type: DataTypes.STRING, allowNull: false },
});

const Item = sequelize.define('Item', {
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING, defaultValue: 'كيلو' },
  purchase_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  reorder_level: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  width: { type: DataTypes.DECIMAL(10, 2), defaultValue: null },
  is_stockable: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Stock = sequelize.define('Stock', {
  quantity: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const Customer = sequelize.define('Customer', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  address: { type: DataTypes.TEXT, defaultValue: '' },
  balance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  credit_limit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Supplier = sequelize.define('Supplier', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  address: { type: DataTypes.TEXT, defaultValue: '' },
  balance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Employee = sequelize.define('Employee', {
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, defaultValue: '' },
  commission_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const FinancialYear = sequelize.define('FinancialYear', {
  name: { type: DataTypes.STRING, allowNull: false },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_closed: { type: DataTypes.BOOLEAN, defaultValue: false },
});

const SalesOrder = sequelize.define('SalesOrder', {
  order_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'delivered', 'cancelled'), defaultValue: 'pending' },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const SalesOrderItem = sequelize.define('SalesOrderItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: null, allowNull: true },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const DeliveryNote = sequelize.define('DeliveryNote', {
  note_no: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'delivered'), defaultValue: 'pending' },
  driver_name: { type: DataTypes.STRING, defaultValue: '' },
  car_no: { type: DataTypes.STRING, defaultValue: '' },
  receiver_name: { type: DataTypes.STRING, defaultValue: '' },
  invoice_no: { type: DataTypes.STRING, defaultValue: '' },
});

const DeliveryNoteItem = sequelize.define('DeliveryNoteItem', {
  net_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  batch_no: { type: DataTypes.STRING, defaultValue: '' },
  roll_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  core_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  wood_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  stretch_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  gross_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  ordered_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  source_order_no: { type: DataTypes.STRING, defaultValue: '' },
});

const DeliveryNoteOrder = sequelize.define('DeliveryNoteOrder', {}, { timestamps: false });

const SalesInvoice = sequelize.define('SalesInvoice', {
  invoice_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'posted'), defaultValue: 'draft' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 14 },
  tax_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  paid: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  remaining: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  delivery_note_id: { type: DataTypes.INTEGER, allowNull: true },
});

const SalesInvoiceItem = sequelize.define('SalesInvoiceItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const PurchaseInvoice = sequelize.define('PurchaseInvoice', {
  invoice_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'posted'), defaultValue: 'draft' },
  subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 14 },
  tax_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  paid: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  remaining: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const PurchaseInvoiceItem = sequelize.define('PurchaseInvoiceItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const PurchaseReturn = sequelize.define('PurchaseReturn', {
  return_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING, defaultValue: '' },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const PurchaseReturnItem = sequelize.define('PurchaseReturnItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const SalesReturn = sequelize.define('SalesReturn', {
  return_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.STRING, defaultValue: '' },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const SalesReturnItem = sequelize.define('SalesReturnItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const CashReceipt = sequelize.define('CashReceipt', {
  receipt_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  payment_method: { type: DataTypes.STRING, defaultValue: 'نقدي' },
  notes: { type: DataTypes.STRING, defaultValue: '' },
});

const CashPayment = sequelize.define('CashPayment', {
  payment_no: { type: DataTypes.STRING, allowNull: false, unique: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  payment_method: { type: DataTypes.STRING, defaultValue: 'نقدي' },
  notes: { type: DataTypes.STRING, defaultValue: '' },
});

const Check = sequelize.define('Check', {
  check_no: { type: DataTypes.STRING, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  party_type: { type: DataTypes.ENUM('customer', 'supplier'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  due_date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'collected', 'bounced'), defaultValue: 'pending' },
  bank_name: { type: DataTypes.STRING, defaultValue: '' },
  notes: { type: DataTypes.STRING, defaultValue: '' },
});

const Expense = sequelize.define('Expense', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  category: { type: DataTypes.STRING, defaultValue: '' },
});

const OtherIncome = sequelize.define('OtherIncome', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  category: { type: DataTypes.STRING, defaultValue: '' },
});

const StockMovement = sequelize.define('StockMovement', {
  movement_type: { type: DataTypes.ENUM('إضافة', 'صرف', 'تعديل جرد', 'تحويل داخل', 'تحويل خارج', 'فاتورة شراء', 'فاتورة بيع', 'مرتجع شراء', 'مرتجع بيع', 'تركيب'), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  unit_price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  description: { type: DataTypes.STRING, defaultValue: '' },
  reference: { type: DataTypes.STRING, defaultValue: '' },
});

const WarehouseTransfer = sequelize.define('WarehouseTransfer', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'confirmed'), defaultValue: 'pending' },
  notes: { type: DataTypes.STRING, defaultValue: '' },
});

const WarehouseTransferItem = sequelize.define('WarehouseTransferItem', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const ItemAssembly = sequelize.define('ItemAssembly', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  assembled_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  assembled_weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const ItemAssemblyComponent = sequelize.define('ItemAssemblyComponent', {
  quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  weight: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const OpeningBalance = sequelize.define('OpeningBalance', {
  party_type: { type: DataTypes.ENUM('customer', 'supplier'), allowNull: false },
  party_id: { type: DataTypes.INTEGER, allowNull: false },
  debit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  credit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
});

const Settings = sequelize.define('Settings', {
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  value: { type: DataTypes.TEXT, defaultValue: '' },
});

// ===== Associations =====
Item.belongsTo(Category, { foreignKey: 'category_id', allowNull: true });
Category.hasMany(Item, { foreignKey: 'category_id' });
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parent_id' });
Item.belongsTo(ItemType, { foreignKey: 'type_id', allowNull: true });
ItemType.hasMany(Item, { foreignKey: 'type_id' });

Stock.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
Stock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Item.hasMany(Stock, { foreignKey: 'item_id' });
Warehouse.hasMany(Stock, { foreignKey: 'warehouse_id' });

SalesOrder.belongsTo(Customer, { foreignKey: 'customer_id' });
Customer.hasMany(SalesOrder, { foreignKey: 'customer_id' });
SalesOrderItem.belongsTo(SalesOrder, { foreignKey: 'order_id', onDelete: 'CASCADE' });
SalesOrderItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
SalesOrder.hasMany(SalesOrderItem, { foreignKey: 'order_id', as: 'items' });

DeliveryNote.belongsTo(Customer, { foreignKey: 'customer_id' });
Customer.hasMany(DeliveryNote, { foreignKey: 'customer_id' });
DeliveryNote.belongsTo(Warehouse, { foreignKey: 'warehouse_id', allowNull: true });
DeliveryNoteItem.belongsTo(DeliveryNote, { foreignKey: 'note_id', onDelete: 'CASCADE' });
DeliveryNoteItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
DeliveryNote.hasMany(DeliveryNoteItem, { foreignKey: 'note_id', as: 'items' });
DeliveryNote.belongsToMany(SalesOrder, { through: DeliveryNoteOrder, foreignKey: 'note_id' });
SalesOrder.belongsToMany(DeliveryNote, { through: DeliveryNoteOrder, foreignKey: 'order_id' });

SalesInvoice.belongsTo(Customer, { foreignKey: 'customer_id' });
SalesInvoice.belongsTo(Employee, { foreignKey: 'employee_id', allowNull: true });
SalesInvoice.belongsTo(Warehouse, { foreignKey: 'warehouse_id', allowNull: true });
SalesInvoice.belongsTo(DeliveryNote, { foreignKey: 'delivery_note_id', allowNull: true });
SalesInvoice.belongsTo(FinancialYear, { foreignKey: 'financial_year_id', allowNull: true });
Customer.hasMany(SalesInvoice, { foreignKey: 'customer_id' });
SalesInvoiceItem.belongsTo(SalesInvoice, { foreignKey: 'invoice_id', onDelete: 'CASCADE' });
SalesInvoiceItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
SalesInvoice.hasMany(SalesInvoiceItem, { foreignKey: 'invoice_id', as: 'items' });

PurchaseInvoice.belongsTo(Supplier, { foreignKey: 'supplier_id' });
PurchaseInvoice.belongsTo(Warehouse, { foreignKey: 'warehouse_id', allowNull: true });
PurchaseInvoice.belongsTo(FinancialYear, { foreignKey: 'financial_year_id', allowNull: true });
Supplier.hasMany(PurchaseInvoice, { foreignKey: 'supplier_id' });
PurchaseInvoiceItem.belongsTo(PurchaseInvoice, { foreignKey: 'invoice_id', onDelete: 'CASCADE' });
PurchaseInvoiceItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
PurchaseInvoice.hasMany(PurchaseInvoiceItem, { foreignKey: 'invoice_id', as: 'items' });

PurchaseReturn.belongsTo(Supplier, { foreignKey: 'supplier_id' });
PurchaseReturn.belongsTo(PurchaseInvoice, { foreignKey: 'invoice_id', allowNull: true });
PurchaseReturnItem.belongsTo(PurchaseReturn, { foreignKey: 'return_id', onDelete: 'CASCADE' });
PurchaseReturnItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
PurchaseReturn.hasMany(PurchaseReturnItem, { foreignKey: 'return_id', as: 'items' });

SalesReturn.belongsTo(Customer, { foreignKey: 'customer_id' });
SalesReturn.belongsTo(SalesInvoice, { foreignKey: 'invoice_id', allowNull: true });
SalesReturnItem.belongsTo(SalesReturn, { foreignKey: 'return_id', onDelete: 'CASCADE' });
SalesReturnItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
SalesReturn.hasMany(SalesReturnItem, { foreignKey: 'return_id', as: 'items' });

CashReceipt.belongsTo(Customer, { foreignKey: 'customer_id' });
Customer.hasMany(CashReceipt, { foreignKey: 'customer_id' });
CashPayment.belongsTo(Supplier, { foreignKey: 'supplier_id' });
Supplier.hasMany(CashPayment, { foreignKey: 'supplier_id' });

Check.belongsTo(Customer, { foreignKey: 'party_id', constraints: false });

StockMovement.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
Item.hasMany(StockMovement, { foreignKey: 'item_id' });

WarehouseTransfer.belongsTo(Warehouse, { as: 'fromWarehouse', foreignKey: 'from_warehouse_id' });
WarehouseTransfer.belongsTo(Warehouse, { as: 'toWarehouse', foreignKey: 'to_warehouse_id' });
WarehouseTransferItem.belongsTo(WarehouseTransfer, { foreignKey: 'transfer_id', onDelete: 'CASCADE' });
WarehouseTransferItem.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
WarehouseTransfer.hasMany(WarehouseTransferItem, { foreignKey: 'transfer_id', as: 'items' });

ItemAssembly.belongsTo(Item, { as: 'assembledItem', foreignKey: 'assembled_item_id' });
ItemAssembly.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
ItemAssemblyComponent.belongsTo(ItemAssembly, { foreignKey: 'assembly_id', onDelete: 'CASCADE' });
ItemAssemblyComponent.belongsTo(Item, { foreignKey: 'item_id', onDelete: 'CASCADE' });
ItemAssembly.hasMany(ItemAssemblyComponent, { foreignKey: 'assembly_id', as: 'components' });

OpeningBalance.belongsTo(FinancialYear, { foreignKey: 'financial_year_id' });

Expense.belongsTo(FinancialYear, { foreignKey: 'financial_year_id', allowNull: true });
OtherIncome.belongsTo(FinancialYear, { foreignKey: 'financial_year_id', allowNull: true });

module.exports = {
  sequelize, User, Warehouse, Category, ItemType, Item, Stock, Customer, Supplier, Employee,
  FinancialYear, SalesOrder, SalesOrderItem, DeliveryNote, DeliveryNoteItem, DeliveryNoteOrder,
  SalesInvoice, SalesInvoiceItem, PurchaseInvoice, PurchaseInvoiceItem,
  PurchaseReturn, PurchaseReturnItem, SalesReturn, SalesReturnItem,
  CashReceipt, CashPayment, Check, Expense, OtherIncome,
  StockMovement, WarehouseTransfer, WarehouseTransferItem,
  ItemAssembly, ItemAssemblyComponent, OpeningBalance, Settings,
};

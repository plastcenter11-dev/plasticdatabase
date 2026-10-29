// Business rules switched on from the settings screen, shared by the invoice routes.
const { Item, Customer, SalesInvoice } = require('../models');
const models = require('../models');
const { getSettings, isOn } = require('./settings');

// a typed invoice number is mandatory when automatic numbering is off
async function invoiceNumberError(data) {
  const s = await getSettings(models);
  if (!isOn(s.opt_auto_numbering) && !String(data.invoice_no || '').trim()) return 'رقم الفاتورة مطلوب (الترقيم التلقائي متوقف من الإعدادات)';
  return null;
}

// no line may sell below the item's purchase price (after the line discount)
async function belowCostError(items, t) {
  const s = await getSettings(models);
  if (!isOn(s.opt_block_below_cost)) return null;
  for (const line of items || []) {
    const item = await Item.findByPk(line.item_id, { transaction: t });
    const cost = Number(item?.purchase_price || 0);
    if (!item || cost <= 0) continue;
    const net = Number(line.price || 0) * (1 - Number(line.discount || 0) / 100);
    if (net < cost) return `الصنف «${item.name}» سعر البيع ${net.toFixed(2)} أقل من سعر التكلفة ${cost.toFixed(2)} (ممنوع من الإعدادات)`;
  }
  return null;
}

// a credit sale needs a credit limit unless the option allows it
async function creditError(inv, t) {
  const s = await getSettings(models);
  if (isOn(s.opt_credit_no_limit)) return null;
  if (!(Number(inv.remaining) > 0)) return null;
  const customer = await Customer.findByPk(inv.customer_id, { transaction: t });
  if (!customer || Number(customer.credit_limit || 0) > 0) return null;
  return `العميل «${customer?.name || ''}» ليس له حد ائتمان، ولا يُسمح بالبيع الآجل له (من الإعدادات)`;
}

// posting needs the invoice to be approved when the option is on
async function approvalError(inv) {
  const s = await getSettings(models);
  if (!isOn(s.opt_require_approval) || inv.approved_at) return null;
  return 'الفاتورة تحتاج اعتماد المدير قبل الترحيل';
}

module.exports = { invoiceNumberError, belowCostError, creditError, approvalError };

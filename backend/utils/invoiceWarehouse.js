const { Item } = require('../models');

// Posting an invoice only moves stock when it has a warehouse; without one the
// post "succeeds" but inventory silently never changes. Returns an Arabic error
// message when the invoice has stockable lines but no warehouse, else null.
async function missingWarehouseError(inv, t) {
  if (inv.warehouse_id) return null;
  const ids = (inv.items || []).map(i => i.item_id);
  if (!ids.length) return null;
  const stockable = await Item.count({ where: { id: ids, is_stockable: true }, transaction: t });
  if (!stockable) return null;
  return 'اختر المخزن أولاً — الفاتورة فيها أصناف مخزنية ولن يتأثر المخزون بدون مخزن. عدّل الفاتورة وحدد المخزن ثم رحّلها.';
}

module.exports = { missingWarehouseError };

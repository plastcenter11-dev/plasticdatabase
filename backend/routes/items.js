const router = require('express').Router();
const {
  Item, Category, ItemType, Stock,
  SalesInvoiceItem, PurchaseInvoiceItem, SalesReturnItem, PurchaseReturnItem,
  DeliveryNoteItem, StockMovement, WarehouseTransferItem, ItemAssemblyComponent, ItemAssembly,
  SalesOrderItem,
} = require('../models');
const { Op } = require('sequelize');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.search) where[Op.or] = [{ name: { [Op.like]: `%${req.query.search}%` } }, { code: { [Op.like]: `%${req.query.search}%` } }];
    if (req.query.category_id) where.category_id = req.query.category_id;
    const items = await Item.findAll({ where, include: [{ model: Category, attributes: ['id', 'name'] }, { model: ItemType, attributes: ['id', 'name'] }], order: [['id', 'DESC']] });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/reorder', async (req, res) => {
  try {
    const items = await Item.findAll({
      where: { is_stockable: true },
      include: [{ model: Stock }],
    });
    const below = items.filter(i => {
      if (!Number(i.reorder_level)) return false;
      const totalWeight = i.Stocks?.reduce((s, st) => s + Number(st.weight || 0), 0) || 0;
      return totalWeight <= Number(i.reorder_level);
    });
    res.json(below);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id, { include: [Category, { model: Stock }] });
    if (!item) return res.status(404).json({ error: 'غير موجود' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'غير موجود' });
    await item.update(req.body);
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'غير موجود' });

    // Every one of these FKs cascade-deletes on Item.destroy() (see
    // models/index.js), which would silently wipe line items and movement
    // history out of documents that are otherwise untouched - the invoice's
    // own stored total/discount/tax would still show the old numbers with
    // the line(s) that produced them gone. Block deletion entirely if the
    // item has ever been used anywhere, rather than let history vanish.
    const usageChecks = await Promise.all([
      SalesInvoiceItem.count({ where: { item_id: item.id } }),
      PurchaseInvoiceItem.count({ where: { item_id: item.id } }),
      SalesReturnItem.count({ where: { item_id: item.id } }),
      PurchaseReturnItem.count({ where: { item_id: item.id } }),
      DeliveryNoteItem.count({ where: { item_id: item.id } }),
      StockMovement.count({ where: { item_id: item.id } }),
      WarehouseTransferItem.count({ where: { item_id: item.id } }),
      ItemAssemblyComponent.count({ where: { item_id: item.id } }),
      ItemAssembly.count({ where: { assembled_item_id: item.id } }),
      SalesOrderItem.count({ where: { item_id: item.id } }),
    ]);
    if (usageChecks.some(c => c > 0)) {
      return res.status(400).json({ error: 'لا يمكن حذف هذا الصنف لأن له حركات أو فواتير مسجلة - يمكنك إخفاؤه بدلاً من حذفه إن أردت' });
    }

    await item.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

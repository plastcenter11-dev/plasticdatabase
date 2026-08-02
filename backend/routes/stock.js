const router = require('express').Router();
const { Stock, StockMovement, WarehouseTransfer, WarehouseTransferItem, ItemAssembly, ItemAssemblyComponent, Item, Warehouse, Category, ItemType, sequelize } = require('../models');

// Stock Adjustments
router.get('/adjustments', async (req, res) => {
  try {
    const where = {};
    if (req.query.type) where.movement_type = req.query.type;
    res.json(await StockMovement.findAll({ where, include: [{ model: Item, attributes: ['id', 'code', 'name'] }, { model: Warehouse, attributes: ['id', 'name'] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/adjustments', async (req, res) => {
  try {
    const { item_id, warehouse_id, quantity, weight, movement_type } = req.body;
    const movement = await StockMovement.create(req.body);
    let [stock] = await Stock.findOrCreate({ where: { item_id, warehouse_id }, defaults: { quantity: 0, weight: 0 } });
    if (movement_type === 'إضافة') {
      await stock.update({ quantity: Number(stock.quantity) + Number(quantity), weight: Number(stock.weight) + Number(weight || 0) });
    } else if (movement_type === 'صرف') {
      await stock.update({ quantity: Number(stock.quantity) - Number(quantity), weight: Number(stock.weight) - Number(weight || 0) });
    } else {
      await stock.update({ quantity: Number(quantity), weight: Number(weight || 0) });
    }
    res.status(201).json(movement);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/adjustments/:id', async (req, res) => {
  try {
    const old = await StockMovement.findByPk(req.params.id);
    if (!old) return res.status(404).json({ error: 'غير موجود' });

    // Reverse old movement effect on stock
    const [oldStock] = await Stock.findOrCreate({ where: { item_id: old.item_id, warehouse_id: old.warehouse_id }, defaults: { quantity: 0, weight: 0 } });
    if (old.movement_type === 'إضافة') {
      await oldStock.update({ quantity: Number(oldStock.quantity) - Number(old.quantity), weight: Number(oldStock.weight) - Number(old.weight || 0) });
    } else if (old.movement_type === 'صرف') {
      await oldStock.update({ quantity: Number(oldStock.quantity) + Number(old.quantity), weight: Number(oldStock.weight) + Number(old.weight || 0) });
    }

    // Update the movement record
    const { item_id, warehouse_id, quantity, weight, movement_type } = req.body;
    await old.update(req.body);

    // Apply new movement effect on stock
    const [newStock] = await Stock.findOrCreate({ where: { item_id, warehouse_id }, defaults: { quantity: 0, weight: 0 } });
    if (movement_type === 'إضافة') {
      await newStock.update({ quantity: Number(newStock.quantity) + Number(quantity), weight: Number(newStock.weight) + Number(weight || 0) });
    } else if (movement_type === 'صرف') {
      await newStock.update({ quantity: Number(newStock.quantity) - Number(quantity), weight: Number(newStock.weight) - Number(weight || 0) });
    } else {
      await newStock.update({ quantity: Number(quantity), weight: Number(weight || 0) });
    }

    res.json(old);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/adjustments/:id', async (req, res) => {
  try {
    const m = await StockMovement.findByPk(req.params.id);
    if (!m) return res.status(404).json({ error: 'غير موجود' });

    // Reverse stock effect before deleting
    const [stock] = await Stock.findOrCreate({ where: { item_id: m.item_id, warehouse_id: m.warehouse_id }, defaults: { quantity: 0, weight: 0 } });
    if (m.movement_type === 'إضافة') {
      await stock.update({ quantity: Number(stock.quantity) - Number(m.quantity), weight: Number(stock.weight) - Number(m.weight || 0) });
    } else if (m.movement_type === 'صرف') {
      await stock.update({ quantity: Number(stock.quantity) + Number(m.quantity), weight: Number(stock.weight) + Number(m.weight || 0) });
    }

    await m.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Item movements report
router.get('/movements/:itemId', async (req, res) => {
  try {
    res.json(await StockMovement.findAll({ where: { item_id: req.params.itemId }, include: [Warehouse], order: [['date', 'ASC'], ['id', 'ASC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stock balances (existing records only)
router.get('/balances', async (req, res) => {
  try {
    res.json(await Stock.findAll({ include: [{ model: Item, attributes: ['id', 'code', 'name', 'unit'] }, { model: Warehouse, attributes: ['id', 'name'] }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All items with stock per warehouse (includes items with zero stock)
router.get('/items-stock', async (req, res) => {
  try {
    const [items, stockRecords, warehouses] = await Promise.all([
      Item.findAll({ where: { is_stockable: true }, attributes: ['id', 'code', 'name', 'unit', 'reorder_level', 'purchase_price', 'sale_price', 'category_id', 'type_id'], include: [{ model: Category, attributes: ['id', 'name'] }, { model: ItemType, attributes: ['id', 'name'] }], order: [['code', 'ASC']] }),
      Stock.findAll({ include: [{ model: Warehouse, attributes: ['id', 'name'] }] }),
      Warehouse.findAll({ attributes: ['id', 'name'] }),
    ]);
    // Map: item_id -> warehouse_id -> stock record
    const stockMap = {};
    stockRecords.forEach(s => {
      if (!stockMap[s.item_id]) stockMap[s.item_id] = {};
      stockMap[s.item_id][s.warehouse_id] = s;
    });
    // Build result: one row per item (total across all warehouses) + per warehouse breakdown
    const result = items.map(item => {
      const itemStocks = warehouses.map(wh => {
        const s = stockMap[item.id]?.[wh.id];
        return { warehouse_id: wh.id, warehouse_name: wh.name, quantity: s ? Number(s.quantity) : 0, weight: s ? Number(s.weight || 0) : 0 };
      }).filter(s => s.quantity !== 0 || s.weight !== 0); // skip warehouses with no stock
      const totalQty = itemStocks.reduce((sum, s) => sum + s.quantity, 0);
      const totalWeight = itemStocks.reduce((sum, s) => sum + s.weight, 0);
      return { item_id: item.id, item_code: item.code, item_name: item.name, unit: item.unit, reorder_level: item.reorder_level, purchase_price: item.purchase_price, sale_price: item.sale_price, category_name: item.Category?.name || null, type_name: item.ItemType?.name || null, total_quantity: totalQty, total_weight: totalWeight, warehouses: itemStocks };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Warehouse Transfers
router.get('/transfers', async (req, res) => {
  try {
    res.json(await WarehouseTransfer.findAll({
      include: [{ model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] }, { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] }, { model: WarehouseTransferItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transfers', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const transfer = await WarehouseTransfer.create(data);
    if (items?.length) await WarehouseTransferItem.bulkCreate(items.map(i => ({ ...i, transfer_id: transfer.id })));
    res.status(201).json(await WarehouseTransfer.findByPk(transfer.id, { include: [{ model: WarehouseTransferItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transfers/:id/confirm', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const transfer = await WarehouseTransfer.findByPk(req.params.id, { include: [{ model: WarehouseTransferItem, as: 'items' }], transaction: t });
    if (!transfer) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (transfer.status === 'confirmed') { await t.rollback(); return res.status(400).json({ error: 'التحويل مؤكد مسبقاً' }); }

    for (const item of transfer.items) {
      const fromStock = await Stock.findOne({ where: { item_id: item.item_id, warehouse_id: transfer.from_warehouse_id }, transaction: t });
      const availableQty = fromStock ? Number(fromStock.quantity) : 0;
      const availableWt = fromStock ? Number(fromStock.weight || 0) : 0;
      if (availableQty < Number(item.quantity || 0) || availableWt < Number(item.weight || 0)) {
        await t.rollback();
        const fullItem = await Item.findByPk(item.item_id);
        return res.status(400).json({ error: `الكمية المتاحة من "${fullItem?.name || item.item_id}" غير كافية للتحويل` });
      }
    }

    for (const item of transfer.items) {
      const [fromStock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: transfer.from_warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
      const [toStock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: transfer.to_warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
      await fromStock.update({ quantity: Number(fromStock.quantity) - Number(item.quantity), weight: Number(fromStock.weight) - Number(item.weight || 0) }, { transaction: t });
      await toStock.update({ quantity: Number(toStock.quantity) + Number(item.quantity), weight: Number(toStock.weight) + Number(item.weight || 0) }, { transaction: t });
    }
    await transfer.update({ status: 'confirmed' }, { transaction: t });
    await t.commit();
    res.json({ message: 'تم التأكيد' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

// Item Assembly
router.get('/assemblies', async (req, res) => {
  try {
    res.json(await ItemAssembly.findAll({
      include: [{ model: Item, as: 'assembledItem', attributes: ['id', 'code', 'name'] }, Warehouse, { model: ItemAssemblyComponent, as: 'components', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assemblies', async (req, res) => {
  try {
    const { components, ...data } = req.body;
    const assembly = await ItemAssembly.create(data);
    if (components?.length) await ItemAssemblyComponent.bulkCreate(components.map(c => ({ ...c, assembly_id: assembly.id })));
    res.status(201).json(await ItemAssembly.findByPk(assembly.id, { include: [{ model: ItemAssemblyComponent, as: 'components' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

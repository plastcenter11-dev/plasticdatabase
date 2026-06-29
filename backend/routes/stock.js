const router = require('express').Router();
const { Stock, StockMovement, WarehouseTransfer, WarehouseTransferItem, ItemAssembly, ItemAssemblyComponent, Item, Warehouse } = require('../models');

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

router.delete('/adjustments/:id', async (req, res) => {
  try {
    const m = await StockMovement.findByPk(req.params.id);
    if (!m) return res.status(404).json({ error: 'غير موجود' });
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

// Stock balances
router.get('/balances', async (req, res) => {
  try {
    res.json(await Stock.findAll({ include: [{ model: Item, attributes: ['id', 'code', 'name', 'unit'] }, { model: Warehouse, attributes: ['id', 'name'] }] }));
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
  try {
    const transfer = await WarehouseTransfer.findByPk(req.params.id, { include: [{ model: WarehouseTransferItem, as: 'items' }] });
    if (!transfer) return res.status(404).json({ error: 'غير موجود' });
    for (const item of transfer.items) {
      let [fromStock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: transfer.from_warehouse_id }, defaults: { quantity: 0, weight: 0 } });
      let [toStock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: transfer.to_warehouse_id }, defaults: { quantity: 0, weight: 0 } });
      await fromStock.update({ quantity: Number(fromStock.quantity) - Number(item.quantity), weight: Number(fromStock.weight) - Number(item.weight || 0) });
      await toStock.update({ quantity: Number(toStock.quantity) + Number(item.quantity), weight: Number(toStock.weight) + Number(item.weight || 0) });
    }
    await transfer.update({ status: 'confirmed' });
    res.json({ message: 'تم التأكيد' });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

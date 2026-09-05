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
  const t = await sequelize.transaction();
  try {
    const { item_id, warehouse_id, quantity, weight, movement_type } = req.body;
    const movement = await StockMovement.create(req.body, { transaction: t });
    let [stock] = await Stock.findOrCreate({ where: { item_id, warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    if (movement_type === 'إضافة') {
      await stock.update({ quantity: Number(stock.quantity) + Number(quantity), weight: Number(stock.weight) + Number(weight || 0) }, { transaction: t });
    } else if (movement_type === 'صرف') {
      await stock.update({ quantity: Number(stock.quantity) - Number(quantity), weight: Number(stock.weight) - Number(weight || 0) }, { transaction: t });
    } else {
      await stock.update({ quantity: Number(quantity), weight: Number(weight || 0) }, { transaction: t });
    }
    await t.commit();
    res.status(201).json(movement);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.put('/adjustments/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const old = await StockMovement.findByPk(req.params.id, { transaction: t });
    if (!old) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (old.movement_type !== 'إضافة' && old.movement_type !== 'صرف') {
      await t.rollback();
      return res.status(400).json({ error: 'لا يمكن تعديل حركة "تعديل جرد" — سجّل حركة تعديل جرد جديدة بدلاً من ذلك' });
    }

    // Reverse old movement effect on stock
    const [oldStock] = await Stock.findOrCreate({ where: { item_id: old.item_id, warehouse_id: old.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    if (old.movement_type === 'إضافة') {
      await oldStock.update({ quantity: Number(oldStock.quantity) - Number(old.quantity), weight: Number(oldStock.weight) - Number(old.weight || 0) }, { transaction: t });
    } else if (old.movement_type === 'صرف') {
      await oldStock.update({ quantity: Number(oldStock.quantity) + Number(old.quantity), weight: Number(oldStock.weight) + Number(old.weight || 0) }, { transaction: t });
    }

    // Update the movement record
    const { item_id, warehouse_id, quantity, weight, movement_type } = req.body;
    await old.update(req.body, { transaction: t });

    // Apply new movement effect on stock
    const [newStock] = await Stock.findOrCreate({ where: { item_id, warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    if (movement_type === 'إضافة') {
      await newStock.update({ quantity: Number(newStock.quantity) + Number(quantity), weight: Number(newStock.weight) + Number(weight || 0) }, { transaction: t });
    } else if (movement_type === 'صرف') {
      await newStock.update({ quantity: Number(newStock.quantity) - Number(quantity), weight: Number(newStock.weight) - Number(weight || 0) }, { transaction: t });
    } else {
      await newStock.update({ quantity: Number(quantity), weight: Number(weight || 0) }, { transaction: t });
    }

    await t.commit();
    res.json(old);
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/adjustments/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const m = await StockMovement.findByPk(req.params.id, { transaction: t });
    if (!m) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    if (m.movement_type !== 'إضافة' && m.movement_type !== 'صرف') {
      await t.rollback();
      return res.status(400).json({ error: 'لا يمكن حذف حركة "تعديل جرد" — سجّل حركة تعديل جرد جديدة بدلاً من ذلك' });
    }

    // Reverse stock effect before deleting
    const [stock] = await Stock.findOrCreate({ where: { item_id: m.item_id, warehouse_id: m.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    if (m.movement_type === 'إضافة') {
      await stock.update({ quantity: Number(stock.quantity) - Number(m.quantity), weight: Number(stock.weight) - Number(m.weight || 0) }, { transaction: t });
    } else if (m.movement_type === 'صرف') {
      await stock.update({ quantity: Number(stock.quantity) + Number(m.quantity), weight: Number(stock.weight) + Number(m.weight || 0) }, { transaction: t });
    }

    await m.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

// Item movements report
router.get('/movements/:itemId', async (req, res) => {
  try {
    const movements = await StockMovement.findAll({ where: { item_id: req.params.itemId }, include: [Warehouse], order: [['date', 'ASC'], ['id', 'ASC']] });

    // For "تركيب" movements the reference is just the assembly's numeric id -
    // look up the assembled item's name so it can be shown alongside it.
    const assemblyIds = [...new Set(movements.filter(m => m.movement_type === 'تركيب').map(m => m.reference))];
    let assemblyNameMap = {};
    if (assemblyIds.length) {
      const assemblies = await ItemAssembly.findAll({
        where: { id: assemblyIds },
        include: [{ model: Item, as: 'assembledItem', attributes: ['id', 'name'] }],
      });
      assemblyNameMap = Object.fromEntries(assemblies.map(a => [String(a.id), a.assembledItem?.name || '']));
    }

    res.json(movements.map(m => {
      const json = m.toJSON();
      if (m.movement_type === 'تركيب' && assemblyNameMap[m.reference]) {
        json.assembly_item_name = assemblyNameMap[m.reference];
      }
      return json;
    }));
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
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    const transfer = await WarehouseTransfer.create(data, { transaction: t });
    if (items?.length) await WarehouseTransferItem.bulkCreate(items.map(i => ({ ...i, transfer_id: transfer.id })), { transaction: t });
    await t.commit();
    res.status(201).json(await WarehouseTransfer.findByPk(transfer.id, { include: [{ model: WarehouseTransferItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.post('/transfers/:id/confirm', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const transfer = await WarehouseTransfer.findByPk(req.params.id, { include: [{ model: WarehouseTransferItem, as: 'items' }], transaction: t, lock: t.LOCK.UPDATE });
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
      include: [
        { model: Item, as: 'assembledItem', attributes: ['id', 'code', 'name'] },
        Warehouse,
        { model: Warehouse, as: 'outputWarehouse' },
        { model: ItemAssemblyComponent, as: 'components', include: [{ model: Item, attributes: ['id', 'code', 'name'] }, Warehouse] },
      ],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assemblies', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { components, ...data } = req.body;
    const outputWarehouseId = data.output_warehouse_id || data.warehouse_id;

    // Each component can be issued from its own warehouse; fall back to the
    // assembly-level warehouse_id for older clients that don't send one.
    const componentWarehouseId = (c) => c.warehouse_id || data.warehouse_id;

    // Check available stock for every component before consuming anything
    for (const c of (components || [])) {
      const stock = await Stock.findOne({ where: { item_id: c.item_id, warehouse_id: componentWarehouseId(c) }, transaction: t });
      const availableQty = stock ? Number(stock.quantity) : 0;
      const availableWt = stock ? Number(stock.weight || 0) : 0;
      if (availableQty < Number(c.quantity || 0) || availableWt < Number(c.weight || 0)) {
        await t.rollback();
        const item = await Item.findByPk(c.item_id);
        return res.status(400).json({ error: `الكمية المتاحة من "${item?.name || c.item_id}" غير كافية للتركيب` });
      }
    }

    const assembly = await ItemAssembly.create(data, { transaction: t });
    if (components?.length) await ItemAssemblyComponent.bulkCreate(components.map(c => ({ ...c, assembly_id: assembly.id })), { transaction: t });

    // Consume components, each from its own warehouse
    for (const c of (components || [])) {
      const whId = componentWarehouseId(c);
      const [stock] = await Stock.findOrCreate({ where: { item_id: c.item_id, warehouse_id: whId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
      await stock.update({ quantity: Number(stock.quantity) - Number(c.quantity || 0), weight: Number(stock.weight || 0) - Number(c.weight || 0) }, { transaction: t });
      await StockMovement.create({
        item_id: c.item_id, warehouse_id: whId, movement_type: 'تركيب',
        quantity: c.quantity, weight: c.weight || 0, date: data.date,
        description: `مكون تركيب صنف رقم ${assembly.id}`, reference: String(assembly.id),
      }, { transaction: t });
    }

    // Add the assembled item to the output warehouse
    const [assembledStock] = await Stock.findOrCreate({ where: { item_id: data.assembled_item_id, warehouse_id: outputWarehouseId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    await assembledStock.update({ quantity: Number(assembledStock.quantity) + Number(data.assembled_qty || 0), weight: Number(assembledStock.weight || 0) + Number(data.assembled_weight || 0) }, { transaction: t });
    await StockMovement.create({
      item_id: data.assembled_item_id, warehouse_id: outputWarehouseId, movement_type: 'تركيب',
      quantity: data.assembled_qty, weight: data.assembled_weight || 0, date: data.date,
      description: `ناتج تركيب رقم ${assembly.id}`, reference: String(assembly.id),
    }, { transaction: t });

    await t.commit();
    res.status(201).json(await ItemAssembly.findByPk(assembly.id, { include: [{ model: ItemAssemblyComponent, as: 'components' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

// Reverse an assembly's stock effect: give back the components, take back the produced item
async function reverseAssembly(assembly, components, t) {
  const outputWarehouseId = assembly.output_warehouse_id || assembly.warehouse_id;
  for (const c of components) {
    const whId = c.warehouse_id || assembly.warehouse_id;
    const [stock] = await Stock.findOrCreate({ where: { item_id: c.item_id, warehouse_id: whId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    await stock.update({ quantity: Number(stock.quantity) + Number(c.quantity || 0), weight: Number(stock.weight || 0) + Number(c.weight || 0) }, { transaction: t });
  }
  const [assembledStock] = await Stock.findOrCreate({ where: { item_id: assembly.assembled_item_id, warehouse_id: outputWarehouseId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
  await assembledStock.update({ quantity: Number(assembledStock.quantity) - Number(assembly.assembled_qty || 0), weight: Number(assembledStock.weight || 0) - Number(assembly.assembled_weight || 0) }, { transaction: t });
}

router.put('/assemblies/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const assembly = await ItemAssembly.findByPk(req.params.id, { include: [{ model: ItemAssemblyComponent, as: 'components' }], transaction: t });
    if (!assembly) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }

    // Reverse the old effect first
    await reverseAssembly(assembly, assembly.components || [], t);

    const { components, ...data } = req.body;
    const outputWarehouseId = data.output_warehouse_id || data.warehouse_id;
    const componentWarehouseId = (c) => c.warehouse_id || data.warehouse_id;

    // Check available stock for every component (now that the old effect is reversed)
    for (const c of (components || [])) {
      const stock = await Stock.findOne({ where: { item_id: c.item_id, warehouse_id: componentWarehouseId(c) }, transaction: t });
      const availableQty = stock ? Number(stock.quantity) : 0;
      const availableWt = stock ? Number(stock.weight || 0) : 0;
      if (availableQty < Number(c.quantity || 0) || availableWt < Number(c.weight || 0)) {
        await t.rollback();
        const item = await Item.findByPk(c.item_id);
        return res.status(400).json({ error: `الكمية المتاحة من "${item?.name || c.item_id}" غير كافية للتركيب` });
      }
    }

    await assembly.update(data, { transaction: t });
    await ItemAssemblyComponent.destroy({ where: { assembly_id: assembly.id }, transaction: t });
    if (components?.length) await ItemAssemblyComponent.bulkCreate(components.map(c => ({ ...c, assembly_id: assembly.id })), { transaction: t });

    // The movement log for this assembly should reflect its current state only -
    // drop the old entries instead of stacking new ones on top of them.
    await StockMovement.destroy({ where: { reference: String(assembly.id), movement_type: 'تركيب' }, transaction: t });

    for (const c of (components || [])) {
      const whId = componentWarehouseId(c);
      const [stock] = await Stock.findOrCreate({ where: { item_id: c.item_id, warehouse_id: whId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
      await stock.update({ quantity: Number(stock.quantity) - Number(c.quantity || 0), weight: Number(stock.weight || 0) - Number(c.weight || 0) }, { transaction: t });
      await StockMovement.create({
        item_id: c.item_id, warehouse_id: whId, movement_type: 'تركيب',
        quantity: c.quantity, weight: c.weight || 0, date: data.date,
        description: `مكون تركيب صنف رقم ${assembly.id}`, reference: String(assembly.id),
      }, { transaction: t });
    }

    const [assembledStock] = await Stock.findOrCreate({ where: { item_id: data.assembled_item_id, warehouse_id: outputWarehouseId }, defaults: { quantity: 0, weight: 0 }, transaction: t });
    await assembledStock.update({ quantity: Number(assembledStock.quantity) + Number(data.assembled_qty || 0), weight: Number(assembledStock.weight || 0) + Number(data.assembled_weight || 0) }, { transaction: t });
    await StockMovement.create({
      item_id: data.assembled_item_id, warehouse_id: outputWarehouseId, movement_type: 'تركيب',
      quantity: data.assembled_qty, weight: data.assembled_weight || 0, date: data.date,
      description: `ناتج تركيب رقم ${assembly.id}`, reference: String(assembly.id),
    }, { transaction: t });

    await t.commit();
    res.json(await ItemAssembly.findByPk(assembly.id, { include: [{ model: ItemAssemblyComponent, as: 'components' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/assemblies/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const assembly = await ItemAssembly.findByPk(req.params.id, { include: [{ model: ItemAssemblyComponent, as: 'components' }], transaction: t });
    if (!assembly) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }

    await reverseAssembly(assembly, assembly.components || [], t);
    await StockMovement.destroy({ where: { reference: String(assembly.id), movement_type: 'تركيب' }, transaction: t });
    await ItemAssemblyComponent.destroy({ where: { assembly_id: assembly.id }, transaction: t });
    await assembly.destroy({ transaction: t });

    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

module.exports = router;

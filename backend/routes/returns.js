const router = require('express').Router();
const { PurchaseReturn, PurchaseReturnItem, SalesReturn, SalesReturnItem, Supplier, Customer, Item, Stock, StockMovement, PurchaseInvoice, SalesInvoice, Warehouse, sequelize } = require('../models');
const { closedYearError } = require('../utils/financialYear');

// Purchase Returns
router.get('/purchase', async (req, res) => {
  try {
    res.json(await PurchaseReturn.findAll({ include: [Supplier, PurchaseInvoice, Warehouse, { model: PurchaseReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/purchase', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    const closedErr = await closedYearError(data.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const max = await PurchaseReturn.max('id') || 0;
    data.return_no = `PR-${String(max + 1).padStart(6, '0')}`;
    if (data.total == null && items?.length) {
      data.total = items.reduce((sum, i) => sum + ((Number(i.weight || 0) || Number(i.quantity || 0)) * Number(i.price || 0) - Number(i.discount || 0)), 0);
    }
    const ret = await PurchaseReturn.create(data, { transaction: t });
    if (items?.length) await PurchaseReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id })), { transaction: t });

    // Purchase return: stock leaves us (decrement), supplier owes us less (decrement balance)
    for (const item of (items || [])) {
      if (ret.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const [stock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: ret.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
          await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });
          await StockMovement.create({
            item_id: item.item_id, warehouse_id: ret.warehouse_id,
            movement_type: 'مرتجع شراء', quantity: qty, weight: wt,
            unit_price: Number(item.price || 0), date: ret.date,
            description: `مرتجع شراء ${ret.return_no}`, reference: ret.return_no,
          }, { transaction: t });
        }
      }
    }
    if (ret.supplier_id) {
      const supplier = await Supplier.findByPk(ret.supplier_id, { transaction: t });
      if (supplier) await supplier.update({ balance: Number(supplier.balance || 0) - Number(ret.total || 0) }, { transaction: t });
    }

    await t.commit();
    res.status(201).json(await PurchaseReturn.findByPk(ret.id, { include: [{ model: PurchaseReturnItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/purchase/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const r = await PurchaseReturn.findByPk(req.params.id, { include: [{ model: PurchaseReturnItem, as: 'items' }], transaction: t });
    if (!r) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(r.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }

    // Reverse the return's stock/balance effects before deleting
    for (const item of (r.items || [])) {
      if (r.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const [stock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: r.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
          await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });
        }
      }
    }
    if (r.supplier_id) {
      const supplier = await Supplier.findByPk(r.supplier_id, { transaction: t });
      if (supplier) await supplier.update({ balance: Number(supplier.balance || 0) + Number(r.total || 0) }, { transaction: t });
    }

    await StockMovement.destroy({ where: { reference: r.return_no, movement_type: 'مرتجع شراء' }, transaction: t });
    await r.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

// Sales Returns
router.get('/sales', async (req, res) => {
  try {
    res.json(await SalesReturn.findAll({ include: [Customer, SalesInvoice, Warehouse, { model: SalesReturnItem, as: 'items', include: [Item] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sales', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items, ...data } = req.body;
    const closedErr = await closedYearError(data.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }
    const max = await SalesReturn.max('id') || 0;
    data.return_no = `SR-${String(max + 1).padStart(6, '0')}`;
    if (data.total == null && items?.length) {
      data.total = items.reduce((sum, i) => sum + ((Number(i.weight || 0) || Number(i.quantity || 0)) * Number(i.price || 0) - Number(i.discount || 0)), 0);
    }
    const ret = await SalesReturn.create(data, { transaction: t });
    if (items?.length) await SalesReturnItem.bulkCreate(items.map(i => ({ ...i, return_id: ret.id })), { transaction: t });

    // Sales return: stock comes back to us (increment), customer owes us less (decrement balance)
    for (const item of (items || [])) {
      if (ret.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const [stock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: ret.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
          await stock.update({ quantity: Number(stock.quantity) + qty, weight: Number(stock.weight || 0) + wt }, { transaction: t });
          await StockMovement.create({
            item_id: item.item_id, warehouse_id: ret.warehouse_id,
            movement_type: 'مرتجع بيع', quantity: qty, weight: wt,
            unit_price: Number(item.price || 0), date: ret.date,
            description: `مرتجع بيع ${ret.return_no}`, reference: ret.return_no,
          }, { transaction: t });
        }
      }
    }
    if (ret.customer_id) {
      const customer = await Customer.findByPk(ret.customer_id, { transaction: t });
      if (customer) await customer.update({ balance: Number(customer.balance || 0) - Number(ret.total || 0) }, { transaction: t });
    }

    await t.commit();
    res.status(201).json(await SalesReturn.findByPk(ret.id, { include: [{ model: SalesReturnItem, as: 'items' }] }));
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

router.delete('/sales/:id', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const r = await SalesReturn.findByPk(req.params.id, { include: [{ model: SalesReturnItem, as: 'items' }], transaction: t });
    if (!r) { await t.rollback(); return res.status(404).json({ error: 'غير موجود' }); }
    const closedErr = await closedYearError(r.date);
    if (closedErr) { await t.rollback(); return res.status(400).json({ error: closedErr }); }

    // Reverse the return's stock/balance effects before deleting
    for (const item of (r.items || [])) {
      if (r.warehouse_id) {
        const fullItem = await Item.findByPk(item.item_id, { transaction: t });
        if (fullItem?.is_stockable) {
          const qty = Number(item.quantity || 0);
          const wt = Number(item.weight || 0);
          const [stock] = await Stock.findOrCreate({ where: { item_id: item.item_id, warehouse_id: r.warehouse_id }, defaults: { quantity: 0, weight: 0 }, transaction: t });
          await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt }, { transaction: t });
        }
      }
    }
    if (r.customer_id) {
      const customer = await Customer.findByPk(r.customer_id, { transaction: t });
      if (customer) await customer.update({ balance: Number(customer.balance || 0) + Number(r.total || 0) }, { transaction: t });
    }

    await StockMovement.destroy({ where: { reference: r.return_no, movement_type: 'مرتجع بيع' }, transaction: t });
    await r.destroy({ transaction: t });
    await t.commit();
    res.json({ message: 'تم الحذف' });
  } catch (err) { if (!t.finished) await t.rollback(); res.status(500).json({ error: err.message }); }
});

module.exports = router;

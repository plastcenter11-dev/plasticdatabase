const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const { Op } = require('sequelize');
const { Warehouse, Stock, Item, StockMovement, WarehouseTransfer, ItemAssembly, SalesInvoice, PurchaseInvoice, DeliveryNote } = require('../models');

router.get('/', async (req, res) => {
  try { res.json(await Warehouse.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id, { include: [{ model: Stock, include: [Item] }] });
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    res.json(w);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Warehouse.create(req.body)); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.put('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    await w.update(req.body);
    res.json(w);
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    // A warehouse that holds stock or appears in any movement/document can't vanish
    // without leaving that history pointing at nothing.
    const used = await Promise.all([
      StockMovement.count({ where: { warehouse_id: w.id } }),
      Stock.count({ where: { warehouse_id: w.id, [Op.or]: [{ quantity: { [Op.ne]: 0 } }, { weight: { [Op.ne]: 0 } }] } }),
      WarehouseTransfer.count({ where: { [Op.or]: [{ from_warehouse_id: w.id }, { to_warehouse_id: w.id }] } }),
      ItemAssembly.count({ where: { [Op.or]: [{ warehouse_id: w.id }, { output_warehouse_id: w.id }] } }),
      SalesInvoice.count({ where: { warehouse_id: w.id } }),
      PurchaseInvoice.count({ where: { warehouse_id: w.id } }),
      DeliveryNote.count({ where: { warehouse_id: w.id } }),
    ]);
    if (used.some(n => n > 0)) {
      return res.status(400).json({ error: 'لا يمكن حذف هذا المخزن لأن له رصيدًا أو حركات أو مستندات مسجلة' });
    }
    await Stock.destroy({ where: { warehouse_id: w.id } });
    await w.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

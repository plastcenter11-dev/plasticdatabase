const router = require('express').Router();
const { SalesOrder, SalesOrderItem, Customer, Item } = require('../models');

router.get('/', async (req, res) => {
  try {
    res.json(await SalesOrder.findAll({ include: [{ model: Customer, attributes: ['id', 'name'] }, { model: SalesOrderItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const o = await SalesOrder.findByPk(req.params.id, { include: [Customer, { model: SalesOrderItem, as: 'items', include: [Item] }] });
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const count = await SalesOrder.count();
    data.order_no = `SO-${String(count + 1).padStart(6, '0')}`;
    const calcItemTotal = i => Number(i.quantity) * Number(i.price) * (i.tax_rate ? 1 + Number(i.tax_rate) / 100 : 1);
    data.total = items.reduce((s, i) => s + calcItemTotal(i), 0);
    const order = await SalesOrder.create(data);
    if (items?.length) await SalesOrderItem.bulkCreate(items.map(i => ({ ...i, order_id: order.id, total: calcItemTotal(i) })));
    res.status(201).json(await SalesOrder.findByPk(order.id, { include: [{ model: SalesOrderItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const order = await SalesOrder.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'غير موجود' });
    const { items, ...data } = req.body;
    if (items) {
      const calcItemTotal = i => Number(i.quantity) * Number(i.price) * (i.tax_rate ? 1 + Number(i.tax_rate) / 100 : 1);
      data.total = items.reduce((s, i) => s + calcItemTotal(i), 0);
      await SalesOrderItem.destroy({ where: { order_id: order.id } });
      await SalesOrderItem.bulkCreate(items.map(i => ({ ...i, order_id: order.id, total: calcItemTotal(i) })));
    }
    await order.update(data);
    res.json(await SalesOrder.findByPk(order.id, { include: [{ model: SalesOrderItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const o = await SalesOrder.findByPk(req.params.id);
    if (!o) return res.status(404).json({ error: 'غير موجود' });
    await o.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/customer/:customerId/pending', async (req, res) => {
  try {
    res.json(await SalesOrder.findAll({
      where: { customer_id: req.params.customerId, status: 'pending' },
      include: [{ model: SalesOrderItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

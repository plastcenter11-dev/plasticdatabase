const router = require('express').Router();
const { Item, Category, ItemType, Stock } = require('../models');
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
      const totalQty = i.Stocks?.reduce((s, st) => s + Number(st.quantity), 0) || 0;
      return totalQty <= Number(i.reorder_level);
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
    await item.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

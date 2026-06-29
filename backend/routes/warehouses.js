const router = require('express').Router();
const { Warehouse, Stock, Item } = require('../models');

router.get('/', async (req, res) => {
  try { res.json(await Warehouse.findAll({ order: [['id', 'ASC']] })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id, { include: [{ model: Stock, include: [Item] }] });
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    res.json(w);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Warehouse.create(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    await w.update(req.body);
    res.json(w);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const w = await Warehouse.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    await w.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

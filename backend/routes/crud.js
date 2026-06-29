const router = require('express').Router();

function crudRoutes(Model, options = {}) {
  const r = router;
  const { include, beforeCreate, afterCreate, beforeDelete, searchFields } = options;

  r.get('/', async (req, res) => {
    try {
      const where = {};
      if (req.query.search && searchFields) {
        const { Op } = require('sequelize');
        where[Op.or] = searchFields.map(f => ({ [f]: { [Op.like]: `%${req.query.search}%` } }));
      }
      const rows = await Model.findAll({ where, include, order: [['id', 'DESC']] });
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.get('/:id', async (req, res) => {
    try {
      const row = await Model.findByPk(req.params.id, { include });
      if (!row) return res.status(404).json({ error: 'غير موجود' });
      res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.post('/', async (req, res) => {
    try {
      if (beforeCreate) await beforeCreate(req);
      const row = await Model.create(req.body);
      if (afterCreate) await afterCreate(row, req);
      res.status(201).json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.put('/:id', async (req, res) => {
    try {
      const row = await Model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: 'غير موجود' });
      await row.update(req.body);
      res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  r.delete('/:id', async (req, res) => {
    try {
      const row = await Model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: 'غير موجود' });
      if (beforeDelete) await beforeDelete(row);
      await row.destroy();
      res.json({ message: 'تم الحذف' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return r;
}

module.exports = crudRoutes;

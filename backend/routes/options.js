// Read-only view of the system options for every signed-in user (the invoice
// screens need them); writing them stays admin-only on PUT /api/settings.
const router = require('express').Router();
const models = require('../models');
const { getSettings } = require('../utils/settings');
const { describeError, errorStatus } = require('../utils/errors');

router.get('/', async (req, res) => {
  try { res.json(await getSettings(models)); }
  catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

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

// The company details printed on documents (delivery-note header and footer). Every signed-in user needs
// them to print, so they are readable by all - and only these keys: the rest of the settings stay behind the
// settings permission.
const COMPANY_KEYS = ['company_name', 'company_address', 'company_phone', 'company_activity', 'company_commercial_reg', 'company_tax_card', 'company_tax_no', 'company_vat_no'];

router.get('/company', async (req, res) => {
  try {
    const rows = await models.Settings.findAll({ where: { key: COMPANY_KEYS } });
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;

// System options kept in the Settings key/value table (edited on the settings
// screen). Defaults match what the screen shows for a key that was never saved.
const DEFAULTS = {
  opt_credit_no_limit: '1',   // allow credit sales to a customer who has no credit limit
  opt_auto_tax: '1',          // new invoices start with the 14% tax rate
  opt_block_below_cost: '0',  // refuse selling below the item's purchase price
  opt_auto_numbering: '1',    // invoice numbers are generated; off = typed by the user
  opt_require_approval: '0',  // an admin must approve an invoice before it can be posted
  protect_until: '',          // documents dated on or before this date are locked
};

async function getSettings(models) {
  const rows = await models.Settings.findAll({ where: { key: Object.keys(DEFAULTS) } });
  const out = { ...DEFAULTS };
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}

const isOn = (value) => value === '1' || value === 'true' || value === true;

module.exports = { DEFAULTS, getSettings, isOn };

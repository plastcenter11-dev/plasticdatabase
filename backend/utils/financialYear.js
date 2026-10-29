const models = require('../models');
const { FinancialYear } = models;
const { getSettings } = require('./settings');

// Returns an Arabic error message if `date` falls inside a closed financial
// year, or null if it's fine to proceed. Dates outside every defined
// financial year (or when none exist yet) are allowed through unchanged.
async function closedYearError(date) {
  if (!date) return null;
  const { protect_until } = await getSettings(models);
  if (protect_until && String(date) <= protect_until) return `لا يمكن تنفيذ هذا الإجراء — السجلات محمية حتى ${protect_until}. ألغِ الحماية أولاً من الإعدادات.`;
  const closedYears = await FinancialYear.findAll({ where: { is_closed: true } });
  const hit = closedYears.find(y => date >= y.start_date && date <= y.end_date);
  if (!hit) return null;
  return `لا يمكن تنفيذ هذا الإجراء — السنة المالية "${hit.name}" مقفولة. أعد فتحها أولاً من إعدادات السنوات المالية.`;
}

module.exports = { closedYearError };

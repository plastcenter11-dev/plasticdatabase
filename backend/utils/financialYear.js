const models = require('../models');
const { FinancialYear } = models;
const { getSettings } = require('./settings');

// Returns an Arabic error message if `date` is locked, or null if it's fine to proceed.
//
// Closing a year closes EVERYTHING up to its last day: a date before the closed year (a year that was never
// defined, or a mistyped one such as 0001-02-21) is just as locked as a date inside it. Records are open again
// only by re-opening the year (admin). "Protect records until" (settings) locks the same way up to its date.
async function closedYearError(date, t) {
  if (!date) return null;
  const { protect_until } = await getSettings(models, t);
  if (protect_until && String(date) <= protect_until) return `لا يمكن تنفيذ هذا الإجراء — السجلات محمية حتى ${protect_until}. ألغِ الحماية أولاً من الإعدادات.`;
  const closedYears = await FinancialYear.findAll({ where: { is_closed: true }, transaction: t });
  if (!closedYears.length) return null;
  const latest = closedYears.reduce((a, b) => (String(b.end_date) > String(a.end_date) ? b : a));
  if (String(date) > String(latest.end_date)) return null;
  const inside = closedYears.find(y => date >= y.start_date && date <= y.end_date);
  if (inside) return `لا يمكن تنفيذ هذا الإجراء — السنة المالية "${inside.name}" مقفولة. أعد فتحها أولاً من إعدادات السنوات المالية.`;
  return `لا يمكن تنفيذ هذا الإجراء — كل السجلات حتى ${String(latest.end_date).slice(0, 10)} مقفولة (إقفال السنة "${latest.name}" يقفل كل ما قبلها). أعد فتح السنة أولاً من إعدادات السنوات المالية.`;
}

module.exports = { closedYearError };

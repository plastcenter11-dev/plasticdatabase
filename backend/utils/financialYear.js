const { FinancialYear } = require('../models');

// Returns an Arabic error message if `date` falls inside a closed financial
// year, or null if it's fine to proceed. Dates outside every defined
// financial year (or when none exist yet) are allowed through unchanged.
async function closedYearError(date) {
  if (!date) return null;
  const closedYears = await FinancialYear.findAll({ where: { is_closed: true } });
  const hit = closedYears.find(y => date >= y.start_date && date <= y.end_date);
  if (!hit) return null;
  return `لا يمكن تنفيذ هذا الإجراء — السنة المالية "${hit.name}" مقفولة. أعد فتحها أولاً من إعدادات السنوات المالية.`;
}

module.exports = { closedYearError };

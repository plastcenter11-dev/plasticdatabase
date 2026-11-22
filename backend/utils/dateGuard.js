'use strict';

// A document date typed by mistake (year 0001, a year too far ahead...) would sit in every statement and
// report in the wrong place. Business documents are dated today or earlier; a few days ahead are let through
// for paperwork dated the next working day.

const { todayStr } = require('./today');

const MIN_DATE = '2000-01-01';
const DAYS_AHEAD = 7;

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// null when the date is fine (or not given: whether a date is required is the route's own rule)
function dateError(date) {
  if (date === undefined || date === null || date === '') return null;
  const s = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) return 'التاريخ غير صالح';
  if (s < MIN_DATE) return `التاريخ ${s} غير معقول — تأكد من السنة`;
  const latest = addDays(todayStr(), DAYS_AHEAD);
  if (s > latest) return `التاريخ ${s} في المستقبل بأكثر من ${DAYS_AHEAD} أيام — تأكد من التاريخ`;
  return null;
}

module.exports = { dateError, MIN_DATE, DAYS_AHEAD };

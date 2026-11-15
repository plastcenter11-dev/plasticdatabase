'use strict';

// Today as YYYY-MM-DD in the server's own (local) time zone. toISOString() would give the UTC day,
// which is still yesterday for the first hours after midnight in Cairo.
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

module.exports = { todayStr };

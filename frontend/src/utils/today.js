// Dates on the screens are plain calendar days (YYYY-MM-DD) in the user's own time zone.
// `new Date().toISOString()` gives the UTC day instead, which is yesterday for the first
// hours after midnight in Cairo, and turns "1 January, local midnight" into 31 December.

const pad = (n) => String(n).padStart(2, '0');

// a Date as YYYY-MM-DD in local time
export const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// today, in local time
export const todayStr = () => dayStr(new Date());

// 1 January of this year, in local time
export const yearStartStr = () => `${new Date().getFullYear()}-01-01`;

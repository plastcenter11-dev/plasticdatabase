'use strict';

// How the backups of the database/ folder are doing, for the dashboard: the newest dump, and whether the last
// run of the daily job left its BACKUP-FAILED marker (scripts/daily.js removes it again after a good run).

const fs = require('fs');
const path = require('path');

const STALE_HOURS = 48;   // a day off is normal (the machine was switched off); two is worth a warning
const DUMP = /^plasticdb-backup-.*\.sql$/;

// problem: null when all is well, else a short Arabic sentence
function backupStatus(dir, now = Date.now()) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch { /* no folder yet */ }
  const mtime = (f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } };
  const lastAt = files.filter(f => DUMP.test(f)).map(mtime).reduce((a, b) => Math.max(a, b), 0);
  const failedAt = files.includes('BACKUP-FAILED.txt') ? mtime('BACKUP-FAILED.txt') : 0;
  const ageHours = lastAt ? (now - lastAt) / 3600000 : null;

  let problem = null;
  if (!lastAt) problem = 'لا توجد أي نسخة احتياطية بعد';
  else if (failedAt > lastAt) problem = 'آخر محاولة نسخ احتياطي فشلت';
  else if (ageHours > STALE_HOURS) problem = `آخر نسخة احتياطية قبل ${Math.floor(ageHours / 24)} يوم`;
  return { last_at: lastAt ? new Date(lastAt).toISOString() : null, age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10, failed: failedAt > lastAt, problem };
}

module.exports = { backupStatus, STALE_HOURS };

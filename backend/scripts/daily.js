// The daily job: back the database up, then run the accounting/stock invariants
// on it. The report goes to database/invariants-latest.txt; when an error-level
// violation exists a database/INVARIANTS-FAILED.txt marker is left next to the
// backups (and removed again once a run is clean), so a problem is noticed the
// next time anyone opens that folder.
//
//   node scripts/daily.js
//
// Exit code 1 when the backup or the check failed.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const outDir = path.join(here, '..', '..', 'database');
fs.mkdirSync(outDir, { recursive: true });
const run = (script, args = []) => spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
const marker = path.join(outDir, 'INVARIANTS-FAILED.txt');
let failed = false;

const backup = run('backup.js');
if (backup.status !== 0) {
  failed = true;
  fs.writeFileSync(path.join(outDir, 'BACKUP-FAILED.txt'), `${stamp}\n${backup.stdout}\n${backup.stderr}`);
} else {
  fs.rmSync(path.join(outDir, 'BACKUP-FAILED.txt'), { force: true });
}

const check = run('check_invariants.js');
const report = `${stamp}\n\n${check.stdout}${check.stderr ? `\n${check.stderr}` : ''}`;
fs.writeFileSync(path.join(outDir, 'invariants-latest.txt'), report);
if (check.status !== 0) {
  failed = true;
  fs.writeFileSync(marker, report);
} else {
  fs.rmSync(marker, { force: true });
}

console.log(`${stamp} backup ${backup.status === 0 ? 'ok' : 'FAILED'}, invariants ${check.status === 0 ? 'ok' : 'FAILED'}`);
process.exit(failed ? 1 : 0);

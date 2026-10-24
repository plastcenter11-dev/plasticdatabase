// Proves the backups can actually be restored: loads a fresh dump of the live
// database and the newest backup file from database/ into a scratch database
// (plasticdb_restore_test, dropped afterwards), then compares row counts with
// the live tables and runs the invariants check on the restored copy.
//
//   node scripts/verify_backup.js
//
// Never writes to the live database. Exit code 1 on any mismatch or failure.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawnSync } = require('child_process');

const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
const SCRATCH = 'plasticdb_restore_test';
const BACKUP_DIR = path.join(__dirname, '..', '..', 'database');

function bin(exe) {
  const dirs = ['C:/Program Files/MySQL/MySQL Server 8.0/bin', 'C:/Program Files/MySQL/MySQL Server 8.4/bin', 'C:/Program Files/MySQL/MySQL Server 5.7/bin', 'C:/xampp/mysql/bin'];
  const hit = dirs.map(d => path.join(d, exe)).find(p => fs.existsSync(p));
  return hit || exe;
}
const auth = [`--host=${DB_HOST}`, `--user=${DB_USER}`, `--password=${DB_PASS}`];

function dumpLive() {
  const r = spawnSync(bin('mysqldump.exe'), [...auth, '--single-transaction', '--routines', '--triggers', DB_NAME], { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('mysqldump failed: ' + r.stderr);
  return r.stdout;
}

function load(sql) {
  const r = spawnSync(bin('mysql.exe'), [...auth, SCRATCH], { input: sql, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0 && /error/i.test(r.stderr)) throw new Error('restore failed: ' + r.stderr.split('\n').find(l => /error/i.test(l)));
}

async function counts(conn, db) {
  const [tables] = await conn.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY 1', [db]);
  const out = {};
  for (const { t } of tables) out[t] = Number((await conn.query(`SELECT COUNT(*) AS n FROM \`${db}\`.\`${t}\``))[0][0].n);
  return out;
}

(async () => {
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASS });
  const problems = [];
  const reset = async () => { await conn.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``); await conn.query(`CREATE DATABASE \`${SCRATCH}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); };
  try {
    // 1. a fresh dump restores to exactly the live data
    await reset();
    load(dumpLive());
    const live = await counts(conn, DB_NAME);
    const restored = await counts(conn, SCRATCH);
    const tables = Object.keys(live);
    for (const t of tables) if (restored[t] !== live[t]) problems.push(`table ${t}: live ${live[t]} rows, restored ${restored[t]}`);
    for (const t of Object.keys(restored)) if (!(t in live)) problems.push(`restored copy has an extra table ${t}`);
    console.log(`fresh dump -> ${tables.length} tables, ${Object.values(restored).reduce((a, b) => a + b, 0)} rows restored`);

    // 2. the invariants run on the restored copy and agree with the live check
    const check = spawnSync(process.execPath, [path.join(__dirname, 'check_invariants.js'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, DB_NAME: SCRATCH } });
    let restoredReport; try { restoredReport = JSON.parse(check.stdout); } catch { problems.push('the invariants check could not run on the restored copy: ' + (check.stderr || check.stdout).slice(0, 300)); }
    const liveCheck = spawnSync(process.execPath, [path.join(__dirname, 'check_invariants.js'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (restoredReport) {
      const liveReport = JSON.parse(liveCheck.stdout);
      if (restoredReport.errors !== liveReport.errors || restoredReport.warnings !== liveReport.warnings) {
        problems.push(`invariants differ: live ${liveReport.errors} errors / ${liveReport.warnings} warnings, restored ${restoredReport.errors} / ${restoredReport.warnings}`);
      }
      console.log(`invariants on the restored copy: ${restoredReport.errors} errors, ${restoredReport.warnings} warnings (live: ${liveReport.errors} / ${liveReport.warnings})`);
    }

    // 3. the newest backup file on disk restores without errors
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^plasticdb-backup-.*\.sql$/.test(f)).sort();
    if (!files.length) problems.push('no backup file found in database/');
    else {
      const newest = files[files.length - 1];
      await reset();
      load(fs.readFileSync(path.join(BACKUP_DIR, newest), 'utf8'));
      const fromFile = await counts(conn, SCRATCH);
      const empty = Object.keys(live).filter(t => !(t in fromFile));
      if (empty.length) problems.push(`backup file ${newest} is missing tables: ${empty.join(', ')}`);
      console.log(`newest file ${newest} -> ${Object.keys(fromFile).length} tables restored`);
    }
  } catch (e) {
    problems.push(e.message);
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await conn.end();
  }
  if (problems.length) { console.log('\nFAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log('\nbackup restore verified');
})();

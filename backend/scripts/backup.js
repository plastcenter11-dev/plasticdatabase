// Standalone daily-backup script - not part of the running server, meant to
// be invoked by a Windows Scheduled Task so it works even if the app itself
// isn't currently running. Dumps the live database via mysqldump into the
// project's database/ folder, then deletes dumps older than KEEP_DAYS.
//
// A second copy goes to the folder picked in Settings > Backup (kept in the Settings table), or
// to BACKUP_COPY_DIR from backend/.env on a machine where none was picked. How that copy went is
// written back to the Settings table so the screen can show it.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const KEEP_DAYS = 30;
const BACKUP_DIR = path.join(__dirname, '..', '..', 'database');
const KEY_DIR = 'backup_copy_dir';
const KEY_LAST = 'backup_copy_last';

function findMysqlBin(exe) {
  const candidates = [
    `C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\${exe}`,
    `C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\${exe}`,
    `C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\${exe}`,
    `C:\\xampp\\mysql\\bin\\${exe}`,
    `C:\\wamp64\\bin\\mysql\\mysql8.0\\bin\\${exe}`,
    `C:\\wamp64\\bin\\mysql\\mysql5.7\\bin\\${exe}`,
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return exe; // fallback: hope it's in PATH
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function pruneOld(dir) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(dir)) {
    if (!/^plasticdb-backup-.*\.sql$/.test(f)) continue; // never touch anything else in a shared folder
    const full = path.join(dir, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log(`Pruned old backup: ${f}`);
    }
  }
}

// the folder picked in the program, if any (the app's own database, read with a plain connection)
async function readSettings() {
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASS, database: DB_NAME });
  return {
    dir: async () => {
      const [rows] = await conn.query('SELECT `value` FROM `settings` WHERE `key` = ?', [KEY_DIR]);
      return (rows[0]?.value || '').trim();
    },
    saveLast: async (result) => {
      await conn.query(
        'INSERT INTO `settings` (`key`, `value`, `created_at`, `updated_at`) VALUES (?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()',
        [KEY_LAST, JSON.stringify(result)],
      );
    },
    close: () => conn.end(),
  };
}

async function main() {
  const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;
  if (!DB_NAME) throw new Error('DB_NAME is not set - check backend/.env');

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const mysqldump = findMysqlBin('mysqldump.exe');
  const outFile = path.join(BACKUP_DIR, `plasticdb-backup-${timestamp()}.sql`);
  const args = [`--host=${DB_HOST}`, `--user=${DB_USER}`, `--password=${DB_PASS}`, '--single-transaction', '--routines', '--triggers', DB_NAME];

  const result = spawnSync(mysqldump, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`mysqldump exited with code ${result.status}: ${result.stderr}`);
  fs.writeFileSync(outFile, result.stdout);
  console.log(`Backup written: ${outFile} (${(result.stdout.length / 1024 / 1024).toFixed(2)} MB)`);

  pruneOld(BACKUP_DIR);

  // Second copy somewhere that is not this computer. The main backup above is already safe, so a
  // copy that cannot be made is reported as a failure at the end rather than hidden.
  let settings = null;
  let copyDir = '';
  try {
    settings = await readSettings();
    copyDir = await settings.dir();
  } catch (err) {
    console.error(`Could not read the backup folder setting (${err.message})`);
  }
  copyDir = copyDir || (process.env.BACKUP_COPY_DIR || '').trim();

  if (copyDir) {
    const last = { at: new Date().toISOString(), dir: copyDir, file: path.basename(outFile), ok: true, message: 'تمت النسخة الثانية' };
    try {
      if (!fs.existsSync(copyDir)) throw new Error(`the folder does not exist or is not connected: ${copyDir}`);
      fs.copyFileSync(outFile, path.join(copyDir, path.basename(outFile)));
      pruneOld(copyDir);
      console.log(`Second copy written: ${copyDir}`);
    } catch (err) {
      last.ok = false;
      last.message = `فشلت النسخة الثانية: ${err.message}`;
      console.error(`Second copy FAILED (${err.message}); the main backup in ${BACKUP_DIR} is fine`);
      process.exitCode = 1;
    }
    try { if (settings) await settings.saveLast(last); } catch (err) { console.error(`Could not record the copy result (${err.message})`); }
  }
  if (settings) { try { await settings.close(); } catch { /* nothing to do */ } }
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});

// Standalone daily-backup script - not part of the running server, meant to
// be invoked by a Windows Scheduled Task so it works even if the app itself
// isn't currently running. Dumps the live database via mysqldump into
// backend/backups/, then deletes dumps older than KEEP_DAYS.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KEEP_DAYS = 30;
const BACKUP_DIR = path.join(__dirname, '..', '..', 'database');

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

function main() {
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

  // Prune backups older than KEEP_DAYS
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log(`Pruned old backup: ${f}`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}

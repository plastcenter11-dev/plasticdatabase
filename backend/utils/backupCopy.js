'use strict';

// The second (off-machine) copy of the daily backup: where it goes, whether that place can be
// written to, and a folder browser so the place can be picked from inside the program.
// The folder is kept in the Settings table (key backup_copy_dir); BACKUP_COPY_DIR in
// backend/.env still works as a fallback for a machine where nobody picked one.

const fs = require('fs');
const path = require('path');

const KEY_DIR = 'backup_copy_dir';
const KEY_LAST = 'backup_copy_last';

// can files really be written there? (exists, is a folder, and a test file can be created and removed)
function checkFolder(dir) {
  const d = String(dir || '').trim();
  if (!d) return { ok: false, message: 'لم يُحدَّد مكان' };
  try {
    if (!fs.existsSync(d)) return { ok: false, message: 'المكان غير موجود أو غير متصل (الفلاشة مش موصولة؟)' };
    if (!fs.statSync(d).isDirectory()) return { ok: false, message: 'المسار ده ملف مش فولدر' };
    const probe = path.join(d, `.plasticdb-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { ok: true, message: 'المكان متاح والكتابة فيه شغالة' };
  } catch (err) {
    return { ok: false, message: `لا يمكن الكتابة في هذا المكان (${err.code || err.message})` };
  }
}

// Windows drive letters that currently exist (a USB drive shows up here once plugged in)
function listDrives() {
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try { if (fs.existsSync(root)) drives.push(root); } catch { /* an unreadable drive is just skipped */ }
  }
  return drives;
}

// Sub-folders of `dir` (folders only, never files). An empty path lists the drives instead.
function browse(dir) {
  const p = String(dir || '').trim();
  if (!p) return { path: '', parent: null, dirs: listDrives().map(d => ({ name: d, path: d })) };
  const resolved = path.resolve(p);
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const dirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('$') && e.name !== 'System Volume Information')
    .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const up = path.dirname(resolved);
  // at a drive root the way "up" is the list of drives
  return { path: resolved, parent: up === resolved ? '' : up, dirs };
}

module.exports = { KEY_DIR, KEY_LAST, checkFolder, browse, listDrives };

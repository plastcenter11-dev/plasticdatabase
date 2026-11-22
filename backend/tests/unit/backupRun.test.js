// The daily backup's helpers: when mysqldump is told not to use TLS, how it is retried, and how the
// dashboard judges the backup folder.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isLocalHost, dumpArgs, withRetry } = require('../../utils/backupRun');
const { backupStatus } = require('../../utils/backupStatus');

describe('dumpArgs', () => {
  const base = { user: 'u', password: 'p', database: 'db' };
  test('a database on this machine is dumped without TLS (the cause of the "2026: SSL connection error" runs)', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '']) {
      expect(dumpArgs({ ...base, host })).toContain('--ssl-mode=DISABLED');
    }
  });
  test('a database on another machine keeps the default (TLS when offered)', () => {
    expect(dumpArgs({ ...base, host: 'db.example.com' })).not.toContain('--ssl-mode=DISABLED');
    expect(isLocalHost('10.0.0.5')).toBe(false);
  });
  test('always a consistent dump with routines and triggers, ending with the database name', () => {
    const a = dumpArgs({ ...base, host: 'localhost' });
    expect(a).toEqual(expect.arrayContaining(['--single-transaction', '--routines', '--triggers']));
    expect(a[a.length - 1]).toBe('db');
  });
});

describe('withRetry', () => {
  const fail = { status: 2, stderr: 'mysqldump: Got error: 2026: SSL connection error' };
  test('returns at once when the first try works, without waiting', () => {
    const sleep = jest.fn();
    const ok = { status: 0, stdout: 'dump' };
    expect(withRetry(() => ok, { sleep })).toBe(ok);
    expect(sleep).not.toHaveBeenCalled();
  });
  test('tries again after a failure and succeeds when MySQL is ready', () => {
    const sleep = jest.fn();
    const results = [fail, fail, { status: 0, stdout: 'dump' }];
    const got = withRetry(() => results.shift(), { sleep, waitMs: 5 });
    expect(got.stdout).toBe('dump');
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
  test('gives up after the last attempt with the real error, and does not wait after it', () => {
    const sleep = jest.fn();
    let tries = 0;
    expect(() => withRetry(() => { tries++; return fail; }, { attempts: 3, sleep })).toThrow(/code 2.*SSL connection error/s);
    expect(tries).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  test('a program that cannot even start (no mysqldump) is retried and then reported as such', () => {
    const err = new Error('spawn mysqldump ENOENT');
    expect(() => withRetry(() => ({ error: err }), { attempts: 2, sleep: () => {} })).toThrow('spawn mysqldump ENOENT');
  });
});

describe('backupStatus', () => {
  let dir;
  const NOW = Date.parse('2026-11-22T12:00:00Z');
  const hoursAgo = (h) => new Date(NOW - h * 3600000);
  const put = (name, h) => { const p = path.join(dir, name); fs.writeFileSync(p, 'x'); fs.utimesSync(p, hoursAgo(h), hoursAgo(h)); };
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdb-status-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('a recent backup is fine', () => {
    put('plasticdb-backup-2026-11-22_0100.sql', 11);
    const s = backupStatus(dir, NOW);
    expect(s.problem).toBeNull();
    expect(s.age_hours).toBe(11);
  });
  test('no backup at all, and no folder at all, are problems', () => {
    expect(backupStatus(dir, NOW).problem).toMatch(/لا توجد/);
    expect(backupStatus(path.join(dir, 'missing'), NOW).problem).toMatch(/لا توجد/);
  });
  test('one day without a backup is tolerated (the machine was off), three days are not', () => {
    put('plasticdb-backup-a.sql', 30);
    expect(backupStatus(dir, NOW).problem).toBeNull();
    put('plasticdb-backup-b.sql', 80);
    fs.rmSync(path.join(dir, 'plasticdb-backup-a.sql'));
    expect(backupStatus(dir, NOW).problem).toMatch(/قبل 3 يوم/);
  });
  test('a failure marker newer than the newest backup is reported; an older one is ignored', () => {
    put('plasticdb-backup-a.sql', 20);
    put('BACKUP-FAILED.txt', 2);
    const s = backupStatus(dir, NOW);
    expect(s.failed).toBe(true);
    expect(s.problem).toMatch(/فشلت/);
    put('BACKUP-FAILED.txt', 30);
    expect(backupStatus(dir, NOW).problem).toBeNull();
  });
  test('only real dumps count: other files in the folder do not make it look backed up', () => {
    put('invariants-latest.txt', 1);
    put('notes.sql', 1);
    expect(backupStatus(dir, NOW).problem).toMatch(/لا توجد/);
  });
});

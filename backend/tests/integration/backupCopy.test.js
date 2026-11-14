// The second (off-machine) backup copy: choosing the folder from inside the program.
// POST /api/backup/run is not exercised here (it runs mysqldump for real).

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { sequelize, User, Settings } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const backupCopy = require('../../utils/backupCopy');

const SECRET = process.env.JWT_SECRET || 'secret';
const as = (u) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, role: u.role }, SECRET)}` });

let admin, plain, root;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  admin = await User.create({ username: 'admin_bc', password: 'x', role: 'admin' });
  plain = await User.create({ username: 'user_bc', password: 'x', role: 'user', permissions: { settings: ['view', 'edit'] } });
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'plasticdb-bc-'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); delete process.env.BACKUP_COPY_DIR; });

describe('backupCopy.checkFolder', () => {
  test('a writable folder is ok and leaves nothing behind', () => {
    expect(backupCopy.checkFolder(root).ok).toBe(true);
    expect(fs.readdirSync(root)).toEqual([]);
  });
  test('a missing folder, a file and an empty path are refused', () => {
    expect(backupCopy.checkFolder(path.join(root, 'nope')).ok).toBe(false);
    const f = path.join(root, 'a.txt'); fs.writeFileSync(f, 'x');
    expect(backupCopy.checkFolder(f).ok).toBe(false);
    expect(backupCopy.checkFolder('').ok).toBe(false);
  });
});

describe('backupCopy.browse', () => {
  test('lists only sub-folders, sorted, with a way up', () => {
    fs.mkdirSync(path.join(root, 'b')); fs.mkdirSync(path.join(root, 'a')); fs.writeFileSync(path.join(root, 'file.txt'), 'x');
    const v = backupCopy.browse(root);
    expect(v.dirs.map(d => d.name)).toEqual(['a', 'b']);
    expect(v.parent).toBe(path.dirname(path.resolve(root)));
  });
  test('an empty path lists drives, a drive root goes up to the drive list', () => {
    const v = backupCopy.browse('');
    expect(v.path).toBe('');
    expect(v.parent).toBeNull();
    expect(v.dirs.length).toBeGreaterThan(0);
    const top = path.parse(path.resolve(root)).root;
    expect(backupCopy.browse(top).parent).toBe('');
  });
  test('a path that does not exist throws', () => {
    expect(() => backupCopy.browse(path.join(root, 'nope'))).toThrow();
  });
});

describe('/api/backup/copy', () => {
  test('nothing chosen yet', async () => {
    const res = await request(app).get('/api/backup/copy').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dir: '', source: 'none', check: null, last: null });
  });

  test('a valid folder is saved, checked, and read back', async () => {
    const put = await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: root });
    expect(put.status).toBe(200);
    expect(put.body.check.ok).toBe(true);
    const get = await request(app).get('/api/backup/copy').set(as(admin));
    expect(get.body).toMatchObject({ dir: root, source: 'setting' });
    expect(get.body.check.ok).toBe(true);
  });

  test('a folder that does not exist is refused and the old choice stays', async () => {
    await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: root });
    const bad = await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: path.join(root, 'unplugged') });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBeTruthy();
    expect((await request(app).get('/api/backup/copy').set(as(admin))).body.dir).toBe(root);
  });

  test('an empty dir clears the choice', async () => {
    await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: root });
    const res = await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: '' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/backup/copy').set(as(admin))).body).toMatchObject({ dir: '', source: 'none' });
  });

  test('the .env value is the fallback, and the saved choice wins over it', async () => {
    process.env.BACKUP_COPY_DIR = root;
    expect((await request(app).get('/api/backup/copy').set(as(admin))).body).toMatchObject({ dir: root, source: 'env' });
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'plasticdb-bc2-'));
    try {
      await request(app).put('/api/backup/copy').set(as(admin)).send({ dir: other });
      expect((await request(app).get('/api/backup/copy').set(as(admin))).body).toMatchObject({ dir: other, source: 'setting' });
    } finally { fs.rmSync(other, { recursive: true, force: true }); }
  });

  test('the result of the last copy written by the backup job is shown', async () => {
    const last = { at: '2026-11-14T10:00:00.000Z', dir: root, file: 'plasticdb-backup-x.sql', ok: false, message: 'فشلت النسخة الثانية: test' };
    await Settings.upsert({ key: backupCopy.KEY_LAST, value: JSON.stringify(last) });
    expect((await request(app).get('/api/backup/copy').set(as(admin))).body.last).toEqual(last);
  });

  test('browse over HTTP: folders only, and 400 for a bad path', async () => {
    fs.mkdirSync(path.join(root, 'sub'));
    const ok = await request(app).get('/api/backup/browse').query({ path: root }).set(as(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.dirs.map(d => d.name)).toEqual(['sub']);
    const bad = await request(app).get('/api/backup/browse').query({ path: path.join(root, 'nope') }).set(as(admin));
    expect(bad.status).toBe(400);
  });

  test('only an admin can read or change it, or browse the disk', async () => {
    expect((await request(app).get('/api/backup/copy').set(as(plain))).status).toBe(403);
    expect((await request(app).put('/api/backup/copy').set(as(plain)).send({ dir: root })).status).toBe(403);
    expect((await request(app).get('/api/backup/browse').set(as(plain))).status).toBe(403);
    expect((await request(app).post('/api/backup/run').set(as(plain))).status).toBe(403);
    expect((await request(app).get('/api/backup/copy')).status).toBe(401);
  });
});

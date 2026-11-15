// What protects a server that faces the internet: sign-in limits, sessions, headers, CORS, error text.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../app');
const { sequelize, User } = require('../../models');
const { syncDb, truncateAll } = require('../helpers/db');
const loginGuard = require('../../utils/loginGuard');
const { describeError } = require('../../utils/errors');

const SECRET = process.env.JWT_SECRET || 'secret';
const as = (token) => ({ Authorization: `Bearer ${token}` });
const tokenFor = (user, iat) => jwt.sign({ id: user.id, role: user.role, ...(iat ? { iat } : {}) }, SECRET);
const login = (username, password) => request(app).post('/api/auth/login').send({ username, password });

let admin, worker;

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  loginGuard.reset();
  admin = await User.create({ username: 'boss', password: await bcrypt.hash('boss-pass-1', 10), role: 'admin' });
  worker = await User.create({ username: 'worker', password: await bcrypt.hash('worker-pass-1', 10), role: 'user', permissions: { items: ['view'] } });
});

describe('sign-in limits', () => {
  test('five wrong passwords lock that user, even for the right password; others are not affected', async () => {
    for (let i = 0; i < 5; i++) expect((await login('worker', 'wrong')).status).toBe(401);
    const locked = await login('worker', 'worker-pass-1');
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    expect((await login('boss', 'boss-pass-1')).status).toBe(200);
  });

  test('a right password before the limit resets the count', async () => {
    for (let i = 0; i < 4; i++) await login('worker', 'wrong');
    expect((await login('worker', 'worker-pass-1')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login('worker', 'wrong')).status).toBe(401);
  });

  test('the lock ends after its time', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < loginGuard.MAX_FAILS; i++) loginGuard.recordFailure('1.2.3.4', 'x', t0);
    expect(loginGuard.check('1.2.3.4', 'x', t0 + 1000)).not.toBeNull();
    expect(loginGuard.check('1.2.3.4', 'x', t0 + loginGuard.LOCK_MS + 1000)).toBeNull();
  });

  test('a missing user name or password is a 400, not a crash', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ username: 'worker' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ username: { $ne: '' }, password: 'x' })).status).toBe(400);
  });

  test('a switched-off user cannot sign in and gets the same answer as a wrong password', async () => {
    await worker.update({ is_active: false });
    const res = await login('worker', 'worker-pass-1');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe((await login('worker', 'nope')).body.error);
  });
});

describe('sessions', () => {
  test('changing the password ends sessions that were signed in before', async () => {
    const old = tokenFor(worker, Math.floor(Date.now() / 1000) - 60);
    expect((await request(app).get('/api/items').set(as(old))).status).toBe(200);

    const change = await request(app).post('/api/auth/change-password').set(as(old)).send({ current_password: 'worker-pass-1', new_password: 'brand-new-pass' });
    expect(change.status).toBe(200);
    expect((await request(app).get('/api/items').set(as(old))).status).toBe(401);

    const fresh = await login('worker', 'brand-new-pass');
    expect(fresh.status).toBe(200);
    expect((await request(app).get('/api/items').set(as(fresh.body.token))).status).toBe(200);
  });

  test('a new password must be at least 8 characters', async () => {
    const t = tokenFor(worker);
    const res = await request(app).post('/api/auth/change-password').set(as(t)).send({ current_password: 'worker-pass-1', new_password: 'short' });
    expect(res.status).toBe(400);
    expect((await login('worker', 'worker-pass-1')).status).toBe(200); // unchanged
  });

  test('an admin resetting a user password also ends that user sessions', async () => {
    const old = tokenFor(worker, Math.floor(Date.now() / 1000) - 60);
    const res = await request(app).put(`/api/users/${worker.id}`).set(as(tokenFor(admin))).send({ password: 'reset-by-admin-1' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/items').set(as(old))).status).toBe(401);
    expect((await login('worker', 'reset-by-admin-1')).status).toBe(200);
  });
});

describe('user accounts', () => {
  test('a password under 8 characters is refused when creating or editing a user', async () => {
    const t = as(tokenFor(admin));
    expect((await request(app).post('/api/users').set(t).send({ username: 'weak', password: 'abc', role: 'user' })).status).toBe(400);
    expect((await request(app).post('/api/users').set(t).send({ username: 'nopass', role: 'user' })).status).toBe(400);
    expect((await request(app).put(`/api/users/${worker.id}`).set(t).send({ password: 'abc' })).status).toBe(400);
    expect((await request(app).post('/api/users').set(t).send({ username: 'good', password: 'long-enough-1', role: 'user' })).status).toBe(201);
  });

  test('only the known fields are taken from the request', async () => {
    const t = as(tokenFor(admin));
    const res = await request(app).post('/api/users').set(t).send({ username: 'extra', password: 'long-enough-1', id: 9999, password_changed_at: '2099-01-01', createdAt: '2000-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(9999);
    expect((await User.findByPk(res.body.id)).password_changed_at).toBeNull();
  });

  test('an admin cannot delete, switch off or demote their own account', async () => {
    const t = as(tokenFor(admin));
    expect((await request(app).delete(`/api/users/${admin.id}`).set(t)).status).toBe(400);
    expect((await request(app).put(`/api/users/${admin.id}`).set(t).send({ is_active: false })).status).toBe(400);
    expect((await request(app).put(`/api/users/${admin.id}`).set(t).send({ role: 'user' })).status).toBe(400);
    expect((await request(app).put(`/api/users/${worker.id}`).set(t).send({ is_active: false })).status).toBe(200);
  });
});

describe('headers, CORS and errors', () => {
  test('API answers carry the hardening headers and are not cacheable', async () => {
    const res = await request(app).get('/api/items').set(as(tokenFor(worker)));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('another website is not allowed to call the API from a browser', async () => {
    const res = await request(app).options('/api/items').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const local = await request(app).options('/api/items').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('an unknown API address is a JSON 404, a broken body is a 400', async () => {
    const t = as(tokenFor(worker));
    const missing = await request(app).get('/api/does-not-exist').set(t);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBeDefined();
    const broken = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"username": ');
    expect(broken.status).toBe(400);
  });

  test('database errors are not shown to the user, our own messages are', () => {
    const dbError = Object.assign(new Error("Unknown column 'secret_col' in 'field list'"), { name: 'SequelizeDatabaseError', sql: 'SELECT secret_col FROM users' });
    expect(describeError(dbError)).not.toContain('secret_col');
    expect(describeError(new Error('الصنف غير موجود'))).toBe('الصنف غير موجود');
  });
});

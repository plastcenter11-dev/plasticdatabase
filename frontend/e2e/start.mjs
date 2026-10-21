// `npm run e2e` - runs the browser smoke tests in isolation:
//   1. creates a scratch database (plasticdb_e2e) next to the real one,
//   2. starts a second backend on port 3101 pointed at it,
//   3. starts a second copy of the app on port 5174 proxying to that backend,
//   4. runs run.mjs against them,
//   5. stops both and drops the scratch database.
// The working database and the normal dev servers are never touched.

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const backendDir = path.resolve(frontendDir, '..', 'backend');
const require = createRequire(path.join(backendDir, 'package.json'));
const mysql = require('mysql2/promise');

const DB = 'plasticdb_e2e';
const API_PORT = 3101;
const APP_PORT = 5174;

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = readEnv(path.join(backendDir, '.env'));

if (!/e2e/.test(DB)) throw new Error('refusing to use a database that is not clearly a scratch one');

async function withDb(fn) {
  const conn = await mysql.createConnection({ host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASS });
  try { return await fn(conn); } finally { await conn.end(); }
}

const portOpen = (port) => new Promise(resolve => {
  const s = net.connect(port, 'localhost');
  s.on('connect', () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
});
async function waitForPort(port, label, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await portOpen(port)) return; await new Promise(r => setTimeout(r, 500)); }
  throw new Error(`${label} did not start on port ${port}`);
}

const children = [];
function start(cmd, args, options) {
  const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  child.out = '';
  child.stdout.on('data', d => { child.out += d; });
  child.stderr.on('data', d => { child.out += d; });
  children.push(child);
  return child;
}
function stopAll() {
  for (const c of children) {
    if (!c.pid) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
}

let exitCode = 1;
try {
  if (await portOpen(API_PORT) || await portOpen(APP_PORT)) throw new Error(`port ${API_PORT} or ${APP_PORT} is already in use - is another e2e run active?`);

  console.log(`scratch database ${DB}`);
  await withDb(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS \`${DB}\``);
    await c.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  });

  const backend = start('node', ['server.js'], { cwd: backendDir, env: { ...process.env, DB_NAME: DB, PORT: String(API_PORT) } });
  await waitForPort(API_PORT, 'the e2e backend', 600000); // creating ~40 tables on an empty database is slow here
  console.log(`backend on ${API_PORT}`);

  const app = start('npx', ['vite', '--strictPort'], { cwd: frontendDir, env: { ...process.env, VITE_PORT: String(APP_PORT), API_TARGET: `http://localhost:${API_PORT}` } });
  await waitForPort(APP_PORT, 'the e2e app', 120000);
  console.log(`app on ${APP_PORT}\n`);

  if (process.env.E2E_HOLD) {
    // developing recipes: keep the stack up so `node e2e/run.mjs` can be re-run quickly against it
    const stopFile = path.join(here, '.stop');
    fs.rmSync(stopFile, { force: true });
    console.log('holding - run: BASE_URL=http://localhost:' + APP_PORT + ' API_URL=http://localhost:' + API_PORT + ' node e2e/run.mjs   (create e2e/.stop to shut down)');
    const until = Date.now() + 3 * 60 * 60 * 1000;
    while (!fs.existsSync(stopFile) && Date.now() < until) await new Promise(r => setTimeout(r, 1000));
    fs.rmSync(stopFile, { force: true });
    exitCode = 0;
    throw new Error('stopped');
  }

  const run = spawnSync('node', [path.join(here, 'run.mjs')], {
    cwd: frontendDir, stdio: 'inherit',
    env: { ...process.env, BASE_URL: `http://localhost:${APP_PORT}`, API_URL: `http://localhost:${API_PORT}`, JWT_SECRET: env.JWT_SECRET },
  });
  exitCode = run.status ?? 1;
  if (exitCode !== 0 && process.env.SHOW_SERVER_LOG) console.log('\n--- backend log ---\n' + backend.out + '\n--- app log ---\n' + app.out);
} catch (e) {
  if (e.message !== 'stopped') console.error('e2e setup failed:', e.message);
  for (const c of children) if (c.out) console.error(`
--- child output ---
${c.out.slice(-1500)}`);
} finally {
  stopAll();
  try {
    if (!process.env.KEEP_DB) await withDb(c => c.query(`DROP DATABASE IF EXISTS \`${DB}\``));
  } catch (e) { console.error('could not drop the scratch database:', e.message); }
}
process.exit(exitCode);

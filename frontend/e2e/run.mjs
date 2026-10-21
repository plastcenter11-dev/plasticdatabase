// Browser smoke tests: opens the real screens in Chrome, fills the real forms and
// saves them, then checks what the backend ended up with. Run it through
// `npm run e2e`, which starts an isolated backend + database and a second copy of
// the app (see start.mjs); it never touches the working database.
//
//   BASE_URL / API_URL    where the isolated app and its API are served
//   E2E_ONLY="a,b"        run only the recipes whose name contains one of these
//   CHROME_PATH           browser executable (defaults to the installed Chrome / Edge)
//   HEADED=1              show the browser while it runs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { watch } from './lib.mjs';
import { recipes } from './recipes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..', '..', 'backend');
const require = createRequire(path.join(backendDir, 'package.json'));
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';
const API_URL = process.env.API_URL || 'http://localhost:3101';

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found - set CHROME_PATH');
  return found;
}

const secret = process.env.JWT_SECRET || readEnv(path.join(backendDir, '.env')).JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET not found in the environment or backend/.env');
const token = jwt.sign({ id: 1, role: 'admin' }, secret, { expiresIn: '2h' });
const adminUser = { id: 1, username: 'admin', role: 'admin', permissions: {} };

async function api(method, url, body) {
  const res = await fetch(API_URL + '/api' + url, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${data && data.error ? data.error : text}`);
  return data;
}

// base records every recipe can pick from, created through the API (re-runnable)
async function seed() {
  const today = new Date().toISOString().slice(0, 10);
  const ensure = async (listUrl, createUrl, match, body) => {
    const existing = (await api('GET', listUrl)).find(match);
    return existing || api('POST', createUrl, body);
  };
  const w1 = await ensure('/warehouses', '/warehouses', x => x.name === 'E2E مخزن 1', { name: 'E2E مخزن 1' });
  const w2 = await ensure('/warehouses', '/warehouses', x => x.name === 'E2E مخزن 2', { name: 'E2E مخزن 2' });
  const item = (code, name, price) => ensure('/items', '/items', x => x.code === code, { code, name, unit: 'كيلو', purchase_price: price, is_stockable: true });
  const a = await item('E2E-A', 'E2E صنف أ', 10);
  const b = await item('E2E-B', 'E2E صنف ب', 20);
  const c = await item('E2E-C', 'E2E صنف ج', 0);
  const customer = await ensure('/customers', '/customers', x => x.name === 'E2E عميل', { name: 'E2E عميل' });
  const supplier = await ensure('/suppliers', '/suppliers', x => x.name === 'E2E مورد', { name: 'E2E مورد' });
  await ensure('/employees', '/employees', x => x.name === 'E2E مندوب', { name: 'E2E مندوب' });
  const stock = await api('GET', '/stock/items-stock');
  for (const it of [a, b]) {
    const here = (stock.find(s => s.item_id === it.id) || { warehouses: [] }).warehouses.find(w => w.warehouse_id === w1.id);
    const weight = here ? Number(here.weight) : 0;
    const quantity = here ? Number(here.quantity) : 0;
    if (weight < 1000 || quantity < 100) {
      await api('POST', '/stock/adjustments', {
        item_id: it.id, warehouse_id: w1.id, movement_type: 'إضافة', date: today, description: 'E2E رصيد افتتاحي',
        quantity: Math.max(0, 100 - quantity) + 100, weight: Math.max(0, 1000 - weight) + 1000,
      });
    }
  }
  return { today, w1, w2, items: { a, b, c }, customer, supplier };
}

const results = [];
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: !process.env.HEADED,
  args: ['--no-sandbox', '--window-size=1500,1000'], defaultViewport: { width: 1500, height: 1000 },
});

try {
  const seeded = await seed();
  const only = (process.env.E2E_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
  const artifacts = path.join(here, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });

  for (const recipe of recipes) {
    if (only.length && !only.some(o => recipe.name.includes(o))) continue;
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((token, user) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, token, adminUser);
    page.on('dialog', (dialog) => dialog.accept());
    const w = watch(page);
    const started = Date.now();
    try {
      await recipe.run({ page, base: BASE_URL, api, w, ...seeded });
      if (w.pageErrors.length) throw new Error(`page error: ${w.pageErrors.join(' | ')}`);
      results.push({ name: recipe.name, ok: true, ms: Date.now() - started });
      console.log(`  ok   ${recipe.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (e) {
      const shot = path.join(artifacts, `${recipe.name.replace(/[^\w\u0600-\u06FF]+/g, '_')}.png`);
      try { await page.screenshot({ path: shot }); } catch { /* page already gone */ }
      results.push({ name: recipe.name, ok: false, error: e.message });
      console.log(`  FAIL ${recipe.name}\n       ${e.message}\n       screenshot: ${shot}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

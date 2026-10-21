// Developer aid for writing recipes: opens a screen, clicks a button and prints the
// fields of the form that appears.
//   BASE_URL=http://localhost:5174 API_URL=http://localhost:3101 node e2e/inspect.mjs /sales-returns "مرتجع جديد"

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { goto, clickText, sleep } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..', '..', 'backend');
const jwt = createRequire(path.join(backendDir, 'package.json'))('jsonwebtoken');
const env = Object.fromEntries(fs.readFileSync(path.join(backendDir, '.env'), 'utf8').split(/\r?\n/).map(l => l.split('=')).filter(p => p.length > 1).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
const token = jwt.sign({ id: 1, role: 'admin' }, env.JWT_SECRET, { expiresIn: '1h' });

const [route, button] = process.argv.slice(2);
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1500, height: 1000 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument((t) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin', permissions: {} })); }, token);
await goto(page, process.env.BASE_URL || 'http://localhost:5174', route);
if (button) await clickText(page, button);
await sleep(500);
const dump = await page.evaluate(() => {
  const scope = document.querySelector('[data-enter-scope]') || document.body;
  const clean = (t) => t.replace(/\s+/g, ' ').trim();
  const labels = [...scope.querySelectorAll('label')].map(l => clean(l.textContent));
  const tables = [...scope.querySelectorAll('table')].map((t, i) => ({
    index: i,
    headers: [...t.querySelectorAll('thead th')].map(h => clean(h.textContent)),
    rowControls: [...(t.querySelector('tbody tr') ? t.querySelector('tbody tr').querySelectorAll('td') : [])].map((td, c) => `${c}:${[...td.querySelectorAll('input,select')].map(i => (i.classList.contains('erp-select') ? 'search' : i.type)).join('+') || clean(td.textContent).slice(0, 12)}`),
  }));
  const buttons = [...scope.querySelectorAll('button')].map(b => clean(b.textContent)).filter(Boolean);
  return { modalTitle: (document.querySelector('[data-enter-scope]')?.parentElement?.querySelector('h2') || {}).textContent, labels, tables, buttons };
});
console.log(JSON.stringify(dump, null, 1));
await browser.close();

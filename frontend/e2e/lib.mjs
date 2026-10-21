// Helpers for the browser smoke tests: drive the real forms the way a person does
// (open the screen, fill the labelled fields, save) and report what the app did.

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The scope a field lives in: the open modal, else the whole page.
const SCOPE = '[data-enter-scope]';

export async function goto(page, base, path) {
  await page.goto(base + path, { waitUntil: 'networkidle0' });
  await sleep(300);
}

// click the first visible button / link whose text contains `text`
export async function clickText(page, text, { within = null, selector = 'button' } = {}) {
  const handle = await page.evaluateHandle((text, within, selector) => {
    const root = within ? document.querySelector(within) : document;
    if (!root) return null;
    const visible = (el) => el.getClientRects().length > 0 && !el.disabled;
    return [...root.querySelectorAll(selector)].find(el => visible(el) && el.textContent.replace(/\s+/g, ' ').includes(text)) || null;
  }, text, within, selector);
  const el = handle.asElement();
  if (!el) throw new Error(`no visible ${selector} with text "${text}"${within ? ` inside ${within}` : ''}`);
  await el.click();
  await sleep(250);
}

// mark the control that belongs to a <label> inside the open modal and return a handle to it
async function controlFor(page, label, nth = 0) {
  const handle = await page.evaluateHandle((SCOPE, label, nth) => {
    const scope = document.querySelector(SCOPE) || document;
    const clean = (t) => t.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    const labels = [...scope.querySelectorAll('label')].filter(l => clean(l.textContent) === label || clean(l.textContent).startsWith(label));
    const l = labels[nth];
    if (!l) return null;
    // the control sits after the label inside the same wrapper (possibly inside a nested row)
    let box = l.parentElement;
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const c = [...box.querySelectorAll('input, select, textarea')].find(el => l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && el.type !== 'hidden');
      if (c) return c;
    }
    return null;
  }, SCOPE, label, nth);
  const el = handle.asElement();
  if (!el) throw new Error(`no field labelled "${label}" in the open form`);
  return el;
}

async function setValue(page, el, value) {
  const kind = await el.evaluate(e => (e.tagName === 'SELECT' ? 'native-select' : e.classList.contains('erp-select') ? 'search-select' : e.type));
  if (kind === 'native-select') {
    await el.select(String(value));
  } else if (kind === 'search-select') {
    await el.click();
    await sleep(150);
    await el.type(String(value), { delay: 15 });
    await sleep(200);
    await page.keyboard.press('Enter'); // picks the first match
    await sleep(200);
  } else if (kind === 'date') {
    await el.evaluate((e, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(e, v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
  } else if (kind === 'checkbox') {
    const checked = await el.evaluate(e => e.checked);
    if (checked !== Boolean(value)) await el.click();
  } else {
    // number / text: set the value the way React expects, then notify it
    await el.evaluate((e, v) => {
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
  }
}

// fill the field labelled `label` (same-label fields: pass nth)
export async function field(page, label, value, nth = 0) {
  const el = await controlFor(page, label, nth);
  await setValue(page, el, value);
}

// the text a labelled field currently shows (e.g. the chosen option of a dropdown)
export async function fieldValue(page, label, nth = 0) {
  // an open dropdown shows what is being typed, not the chosen option: close any open one first
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await sleep(200);
  const el = await controlFor(page, label, nth);
  return el.evaluate(e => e.value);
}

// a cell of the lines table inside the open form (rows and columns count from 0)
export async function cell(page, tableIndex, row, col, value) {
  const handle = await page.evaluateHandle((SCOPE, tableIndex, row, col) => {
    const scope = document.querySelector(SCOPE) || document;
    const table = scope.querySelectorAll('table')[tableIndex];
    const tr = table && table.querySelectorAll('tbody tr')[row];
    const td = tr && tr.querySelectorAll('td')[col];
    return td ? td.querySelector('input, select, textarea') : null;
  }, SCOPE, tableIndex, row, col);
  const el = handle.asElement();
  if (!el) throw new Error(`no input at table ${tableIndex}, row ${row}, column ${col}`);
  await setValue(page, el, value);
}

export async function rowCount(page, tableIndex) {
  return page.evaluate((SCOPE, tableIndex) => {
    const scope = document.querySelector(SCOPE) || document;
    const table = scope.querySelectorAll('table')[tableIndex];
    return table ? table.querySelectorAll('tbody tr').length : 0;
  }, SCOPE, tableIndex);
}

// Save the open form with its submit button and report what happened: the app's
// own success toast, a closed form, or an error toast / failed request.
export async function save(page, watcher, label = 'حفظ') {
  watcher.reset();
  await clickText(page, label, { within: SCOPE });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await page.evaluate((SCOPE) => ({
      error: [...document.querySelectorAll('.Toastify__toast--error')].map(t => t.textContent.trim()),
      success: [...document.querySelectorAll('.Toastify__toast--success')].map(t => t.textContent.trim()),
      open: !!document.querySelector(SCOPE),
    }), SCOPE);
    if (state.error.length) throw new Error(`error toast: ${state.error.join(' | ')}`);
    if (watcher.failed.length) throw new Error(`failed request: ${watcher.failed.join(' | ')}`);
    if (state.success.length || !state.open) { await sleep(300); return state.success[0] || ''; }
    await sleep(150);
  }
  throw new Error('the form neither closed nor showed a success message');
}

// After an action that is not a form save (posting, confirming): wait a moment and
// fail if the app showed an error toast or a request failed.
export async function settle(page, watcher, ms = 900) {
  await sleep(ms);
  const errors = await page.evaluate(() => [...document.querySelectorAll('.Toastify__toast--error')].map(t => t.textContent.trim()));
  if (errors.length) throw new Error(`error toast: ${errors.join(' | ')}`);
  if (watcher.failed.length) throw new Error(`failed request: ${watcher.failed.join(' | ')}`);
}

// collects failed /api responses and page errors while a recipe runs
export function watch(page) {
  const w = { failed: [], pageErrors: [], reset() { this.failed = []; this.pageErrors = []; } };
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/api/') || res.status() < 400) return;
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* not json */ }
    w.failed.push(`${res.request().method()} ${url.split('/api/')[1]} -> ${res.status()} ${detail}`.trim());
  });
  page.on('pageerror', (e) => w.pageErrors.push(e.message));
  return w;
}

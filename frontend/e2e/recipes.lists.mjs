// The sales-invoice list controls in the browser: paging, search, date range,
// customer / remaining filters, sorting and "clear filters". 60 draft invoices
// are created through the API for a dedicated customer so the counts are known.

import { goto, sleep } from './lib.mjs';

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter(r => r.querySelectorAll('td').length > 3)
  .map(r => {
    const t = [...r.querySelectorAll('td')].map(td => td.textContent.trim());
    const num = (s) => Number(s.replace(/[^\d.]/g, ''));
    return { no: t[1], date: t[2], customer: t[3], total: num(t[5]), paid: num(t[6]), remaining: num(t[7]) };
  }));
const pager = (page) => page.evaluate(() => (document.body.innerText.match(/صفحة \d+ من \d+ — [\d,]+ فاتورة/) || [''])[0]);
const setInput = (page, el, value) => el.evaluate((e, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v);
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
const wait = () => sleep(900);
const clickButton = (page, text, exact = true) => page.evaluate((text, exact) => {
  const b = [...document.querySelectorAll('button')].find(x => (exact ? x.textContent.trim() === text : x.textContent.includes(text)));
  if (!b) throw new Error('no button ' + text);
  b.click();
}, text, exact);

async function pickInHeader(page, header, optionText) {
  // header dropdowns are SearchableSelects whose placeholder / value is the column name
  const handle = await page.evaluateHandle((header) => [...document.querySelectorAll('thead input.erp-select')].find(i => i.placeholder === header || i.value === header) || null, header);
  const el = handle.asElement();
  if (!el) throw new Error(`no header dropdown "${header}"`);
  await el.click(); await sleep(150); await el.type(optionText, { delay: 15 }); await sleep(250);
  await page.keyboard.press('Enter'); await wait();
}

export const listRecipes = [
  {
    name: 'قائمة فواتير البيع: ترقيم وبحث وفلاتر وترتيب',
    run: async (c) => {
      const tag = 'E2L' + String(Date.now()).slice(-5);
      const customer = await c.api('POST', '/customers', { name: 'E2E زبون قوائم ' + tag });
      const dates = ['2026-03-05', '2026-04-10', '2026-05-15'];
      for (let i = 0; i < 60; i++) {
        const total = (i + 1) * 10;
        const paid = i % 3 === 0 ? total : 0; // 20 fully paid, 40 open
        await c.api('POST', '/sales-invoices', {
          customer_id: customer.id, warehouse_id: c.w1.id, invoice_no: `${tag}-${String(i + 1).padStart(2, '0')}`, date: dates[i % 3],
          subtotal: total, total, paid, remaining: total - paid,
          items: [{ item_id: c.items.a.id, quantity: 1, weight: 1, price: total, discount: 0, total }],
        });
      }
      await goto(c.page, c.base, '/sales-invoices');
      const searchBox = await c.page.$('input[placeholder="بحث..."]');

      // search narrows to the 60 and pages them
      await setInput(c.page, searchBox, tag); await wait();
      let info = await pager(c.page);
      if (!/صفحة 1 من 3 — 60 فاتورة/.test(info)) throw new Error(`paging line after search: "${info}", expected page 1 of 3 with 60`);
      if ((await rows(c.page)).length !== 25) throw new Error('page 1 should hold 25 invoices');
      await clickButton(c.page, 'التالي'); await wait();
      info = await pager(c.page);
      if (!/صفحة 2 من 3/.test(info)) throw new Error('"next" did not go to page 2: ' + info);
      await clickButton(c.page, 'التالي'); await wait();
      if ((await rows(c.page)).length !== 10) throw new Error('the last page should hold the remaining 10 invoices');
      const nextDisabled = await c.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'التالي').disabled);
      if (!nextDisabled) throw new Error('"next" is enabled on the last page');

      // search by a full invoice number
      await setInput(c.page, searchBox, `${tag}-07`); await wait();
      let r = await rows(c.page);
      if (r.length !== 1 || r[0].no !== `${tag}-07`) throw new Error('searching one invoice number should show exactly it: ' + JSON.stringify(r.map(x => x.no)));
      await setInput(c.page, searchBox, tag); await wait();

      // date range: April only = the 20 invoices dated 2026-04-10
      const dateInputs = await c.page.$$('input[type="date"]');
      await setInput(c.page, dateInputs[0], '2026-04-01'); await wait();
      await setInput(c.page, dateInputs[1], '2026-04-30'); await wait();
      info = await pager(c.page);
      r = await rows(c.page);
      if (r.length === 0 || r.some(x => x.date !== '2026-04-10')) throw new Error('rows outside the date range are shown or none are');
      if (!/20 فاتورة/.test(info) && r.length !== 20) throw new Error(`April should leave 20 invoices, paging "${info}", rows ${r.length}`);

      // remaining filter
      await pickInHeader(c.page, 'المتبقي', 'عليه متبقي');
      r = await rows(c.page);
      if (!r.length || r.some(x => x.remaining <= 0)) throw new Error('the "open" filter shows invoices with nothing remaining');
      await pickInHeader(c.page, 'عليه متبقي', 'مسدد');
      r = await rows(c.page);
      if (r.some(x => x.remaining > 0)) throw new Error('the "paid" filter shows an invoice with a remainder');

      // clear filters (the search box is cleared too), search again, sort by total both ways
      await clickButton(c.page, 'مسح الفلاتر', false); await wait();
      await setInput(c.page, searchBox, tag); await wait();
      info = await pager(c.page);
      if (!/60 فاتورة/.test(info)) throw new Error('after clearing the filters the 60 invoices should be back: ' + info);
      const sortTotal = () => c.page.evaluate(() => {
        const th = [...document.querySelectorAll('thead th')].find(t => t.textContent.includes('الإجمالي'));
        th.querySelector('button').click();
      });
      await sortTotal(); await wait();
      r = await rows(c.page);
      if (r[0].total !== 10 || r[r.length - 1].total !== 250) throw new Error(`sort ascending by total: first ${r[0].total}, last ${r[r.length - 1].total}`);
      await sortTotal(); await wait();
      r = await rows(c.page);
      if (r[0].total !== 600) throw new Error(`sort descending by total: first ${r[0].total}, expected 600`);

      // customer filter without any search
      await clickButton(c.page, 'مسح الفلاتر', false); await wait();
      await pickInHeader(c.page, 'العميل', 'E2E زبون قوائم ' + tag);
      info = await pager(c.page);
      if (!/60 فاتورة/.test(info)) throw new Error('the customer filter should leave the 60 invoices: ' + info);
      r = await rows(c.page);
      if (r.some(x => !x.customer.includes(tag))) throw new Error('the customer filter shows another customer');
    },
  },
];

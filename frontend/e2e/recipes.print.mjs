// Printing: every screen that prints is driven through its print button and the
// printed page is checked. Screens that open a print window (window.open +
// document.write) are read from that window; screens that call window.print()
// on the page itself are checked under print media (menus hidden, data shown).

import { goto, clickText, field, sleep } from './lib.mjs';
import { rowAction, search } from './recipes.editdelete.mjs';

const BAD = /undefined|NaN|\[object|\bnull\b/;

// run `click` and return { html, text } of the window it opens
async function printedWindow(c, click) {
  const opened = new Promise((resolve) => c.browser.once('targetcreated', async (t) => resolve(await t.page())));
  await click();
  const child = await Promise.race([opened, sleep(8000).then(() => null)]);
  if (!child) throw new Error('the print button did not open a print window');
  let text = '';
  for (let i = 0; i < 20 && !text.trim(); i++) { await sleep(300); text = await child.evaluate(() => document.body ? document.body.innerText : '').catch(() => ''); }
  const html = await child.content();
  await child.close().catch(() => {});
  return { html, text };
}

function expectPrinted({ html, text }, mustContain, what) {
  if (!text.trim()) throw new Error(`${what}: the print window is empty`);
  if (BAD.test(text)) throw new Error(`${what}: the print shows a broken value (${(text.match(BAD) || [])[0]}): ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
  if (!/dir="rtl"/i.test(html)) throw new Error(`${what}: the print is not right-to-left`);
  for (const s of mustContain) if (!text.includes(s)) throw new Error(`${what}: the print is missing "${s}": ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
}

const rowPrint = (c, text) => () => c.page.evaluate((text) => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(text));
  const outline = tr && [...tr.querySelectorAll('button')].filter(b => b.classList.contains('erp-btn-outline'));
  if (!outline || !outline.length) throw new Error('no print button in the row');
  outline[outline.length - 1].click(); // edit (drafts only) comes before print
}, text);

const buttonPrint = (c, label = 'طباعة') => () => clickText(c.page, label);

export const printRecipes = [
  {
    name: 'طباعة فاتورة بيع',
    run: async (c) => {
      const no = 'E2E-PRT-' + Date.now();
      const inv = await c.api('POST', '/sales-invoices', {
        customer_id: c.customer.id, warehouse_id: c.w1.id, invoice_no: no, date: c.today, subtotal: 200, discount: 20, tax_rate: 14, tax_amount: 25, total: 205, paid: 100, remaining: 105,
        items: [{ item_id: c.items.a.id, quantity: 2, weight: 10, price: 20, discount: 0, total: 200 }],
      });
      await c.api('POST', `/sales-invoices/${inv.id}/post`);
      await goto(c.page, c.base, '/sales-invoices');
      await search(c.page, no);
      const printed = await printedWindow(c, rowPrint(c, no));
      expectPrinted(printed, [no, 'E2E عميل', 'E2E صنف أ', '205', 'الضريبة'], 'sales invoice print');
    },
  },
  {
    name: 'طباعة فاتورة شراء',
    run: async (c) => {
      const no = 'E2E-PRP-' + Date.now();
      const inv = await c.api('POST', '/purchase-invoices', {
        supplier_id: c.supplier.id, warehouse_id: c.w1.id, invoice_no: no, date: c.today, subtotal: 300, total: 300, paid: 50, remaining: 250,
        items: [{ item_id: c.items.b.id, quantity: 3, weight: 30, price: 10, discount: 0, total: 300 }],
      });
      await c.api('POST', `/purchase-invoices/${inv.id}/post`);
      await goto(c.page, c.base, '/purchase-invoices');
      await search(c.page, no);
      const printed = await printedWindow(c, rowPrint(c, no));
      expectPrinted(printed, [no, 'E2E مورد', 'E2E صنف ب', '300'], 'purchase invoice print');
    },
  },
  {
    name: 'طباعة إذن تسليم',
    run: async (c) => {
      const customer = await c.api('POST', '/customers', { name: 'E2E زبون طباعة' });
      const note = await c.api('POST', '/delivery-notes', {
        date: c.today, customer_id: customer.id, warehouse_id: c.w1.id,
        items: [{ item_id: c.items.a.id, net_weight: 123, roll_count: 4, product_description: 'وصف للطباعة' }],
      });
      await goto(c.page, c.base, '/delivery-notes');
      await search(c.page, 'E2E زبون طباعة');
      const printed = await printedWindow(c, () => c.page.evaluate(() => {
        const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E2E زبون طباعة'));
        [...tr.querySelectorAll('button')].find(b => b.textContent.trim() === 'طباعة').click();
      }));
      expectPrinted(printed, ['E2E زبون طباعة', 'E2E صنف أ', '123'], 'delivery note print');
      void note;
    },
  },
  {
    name: 'طباعة كشف حساب عميل ومورد',
    run: async (c) => {
      for (const [path, label, party] of [['/reports/customer-statement', 'العميل', 'E2E عميل'], ['/reports/supplier-statement', 'المورد', 'E2E مورد']]) {
        await goto(c.page, c.base, path);
        const select = await c.page.$('input.erp-select');
        await select.click(); await sleep(150); await select.type(party, { delay: 15 }); await sleep(250); await c.page.keyboard.press('Enter');
        await sleep(1500);
        const printed = await printedWindow(c, buttonPrint(c));
        expectPrinted(printed, [party], `${label} statement print`);
      }
    },
  },
  {
    name: 'طباعة التقارير التي تفتح نافذة طباعة',
    run: async (c) => {
      // the screens whose print button opens a print window; they must print without broken values
      const pages = [
        ['/reports/expenses', 'تقرير المصروفات'],
        ['/reports/overdue-checks', 'الشيكات المتأخرة'],
        ['/reorder-level', 'حد الطلب'],
        ['/warehouse-items', 'المخزن'],
      ];
      const problems = [];
      for (const [path, name] of pages) {
        try {
          await goto(c.page, c.base, path);
          const printed = await printedWindow(c, buttonPrint(c));
          expectPrinted(printed, [], name);
        } catch (e) { problems.push(`${path}: ${e.message}`); }
      }
      if (problems.length) throw new Error(problems.join('\n       '));
    },
  },
  {
    name: 'طباعة التقارير التي تطبع الصفحة نفسها',
    run: async (c) => {
      // window.print() on the page: the menus must disappear in print media and the data must stay
      const pages = [
        { path: '/reports/customers', must: 'E2E عميل' },
        { path: '/reports/suppliers', must: 'E2E مورد' },
        { path: '/reports/reorder', must: null },
      ];
      const problems = [];
      for (const { path, must } of pages) {
        try {
          await goto(c.page, c.base, path);
          await c.page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
          await clickText(c.page, 'طباعة');
          if (!await c.page.evaluate(() => window.__printed)) throw new Error('the print button did not call print');
          await c.page.emulateMediaType('print');
          const state = await c.page.evaluate(() => {
            const hidden = (el) => !el || getComputedStyle(el).display === 'none';
            return { aside: hidden(document.querySelector('aside')), text: (document.querySelector('main') || document.body).innerText };
          });
          await c.page.emulateMediaType('screen');
          if (!state.aside) throw new Error('the side menu is still visible when printing');
          if (BAD.test(state.text)) throw new Error('the printed page shows a broken value: ' + (state.text.match(BAD) || [])[0]);
          if (must && !state.text.includes(must)) throw new Error(`the printed page is missing "${must}"`);
        } catch (e) { problems.push(`${path}: ${e.message}`); await c.page.emulateMediaType('screen').catch(() => {}); }
      }
      if (problems.length) throw new Error(problems.join('\n       '));
    },
  },
];

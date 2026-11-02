// "Customers who stopped buying but still owe": the report screen.

import { goto, sleep, eventually } from './lib.mjs';
import { setInput, wait } from './recipes.lists.mjs';

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('tbody tr')]
  .filter(r => r.querySelectorAll('td').length > 3)
  .map(r => { const t = [...r.querySelectorAll('td')].map(td => td.textContent.trim()); return { name: t[1], balance: t[3], last: t[4], days: t[5], receipt: t[6] }; }));

export const silentRecipes = [
  {
    name: 'تقرير عملاء توقفوا عن الشراء وعليهم رصيد',
    run: async (c) => {
      const tag = String(Date.now()).slice(-5);
      const mk = async (name, ago, total) => {
        const cust = await c.api('POST', '/customers', { name: `${name} ${tag}` });
        const inv = await c.api('POST', '/sales-invoices', {
          customer_id: cust.id, warehouse_id: c.w1.id, invoice_no: `E2E-SIL-${tag}-${cust.id}`, date: daysAgo(ago), subtotal: total, total, paid: 0, remaining: total,
          items: [{ item_id: c.items.a.id, quantity: 1, weight: 10, price: total / 10, discount: 0, total }],
        });
        await c.api('POST', `/sales-invoices/${inv.id}/post`);
        return cust;
      };
      const quiet = await mk('E2E صامت', 100, 274000);
      await mk('E2E نشط', 5, 8000);
      const settled = await mk('E2E سدد', 100, 1000);
      await c.api('POST', '/finance/cash-receipts', { customer_id: settled.id, amount: 1000, date: daysAgo(90), payment_method: 'نقدي' });

      await goto(c.page, c.base, '/reports/silent-customers');
      const mine = async () => (await rows(c.page)).filter(r => r.name.includes(tag));

      // 60 days (the default): the quiet customer is listed, with the facts; the active and the settled are not
      await eventually(async () => (await mine()).length > 0, 'the quiet customer is not listed');
      const list = await mine();
      if (list.length !== 1 || !list[0].name.includes('صامت')) throw new Error('only the quiet customer should be listed: ' + JSON.stringify(list.map(r => r.name)));
      if (!/274,000/.test(list[0].balance)) throw new Error('the balance shown is ' + list[0].balance);
      if (list[0].last !== daysAgo(100)) throw new Error(`the last purchase shown is ${list[0].last}, expected ${daysAgo(100)}`);
      if (!/100/.test(list[0].days)) throw new Error('the days of silence shown are ' + list[0].days);
      const text = await c.page.evaluate(() => document.body.innerText);
      if (!/عدد العملاء/.test(text) || !/إجمالي المستحق/.test(text)) throw new Error('the summary cards are missing');

      // a shorter threshold brings the recent customer in
      const [daysBox, balanceBox] = await c.page.$$('input[type="number"]');
      await setInput(c.page, daysBox, '3'); await wait();
      await eventually(async () => (await mine()).length === 2, 'with 3 days both the quiet and the recent customer should be listed');
      // a longer threshold than the silence hides the quiet one
      await setInput(c.page, daysBox, '150'); await wait();
      await eventually(async () => (await mine()).length === 0, 'with 150 days nobody of ours should be listed');
      // the minimum balance
      await setInput(c.page, daysBox, '3'); await setInput(c.page, balanceBox, '100000'); await wait();
      await eventually(async () => { const m = await mine(); return m.length === 1 && m[0].name.includes('صامت'); }, 'with a 100,000 minimum only the big debt should remain');
      void quiet; void sleep;
    },
  },
];

// List controls of the other screens: purchase invoices (paging, search, date,
// filters, sort), delivery notes (search, date, filters, sort) and the item
// movement report (warehouse, date range, type filter, running balance).

import { goto, field, sleep } from './lib.mjs';
import { pager, setInput, wait, clickButton, pickInHeader } from './recipes.lists.mjs';

const tableRows = (page, cols) => page.evaluate((cols) => [...document.querySelectorAll('tbody tr')]
  .filter(r => r.querySelectorAll('td').length > 3)
  .map(r => {
    const t = [...r.querySelectorAll('td')].map(td => td.textContent.trim());
    const out = {};
    for (const [name, i] of Object.entries(cols)) out[name] = t[i];
    return out;
  }), cols);
const num = (s) => Number(String(s).replace(/[^\d.-]/g, ''));

export const lists2Recipes = [
  {
    name: 'قائمة فواتير الشراء: ترقيم وبحث وفلاتر وترتيب',
    run: async (c) => {
      const tag = 'E2P' + String(Date.now()).slice(-5);
      const supplier = await c.api('POST', '/suppliers', { name: 'E2E تاجر قوائم ' + tag });
      const dates = ['2026-03-05', '2026-04-10', '2026-05-15'];
      for (let i = 0; i < 40; i++) {
        const total = (i + 1) * 10;
        const paid = i % 4 === 0 ? total : 0; // 10 fully paid, 30 open
        await c.api('POST', '/purchase-invoices', {
          supplier_id: supplier.id, warehouse_id: c.w1.id, invoice_no: `${tag}-${String(i + 1).padStart(2, '0')}`, date: dates[i % 3],
          subtotal: total, total, paid, remaining: total - paid,
          items: [{ item_id: c.items.a.id, quantity: 1, weight: 1, price: total, discount: 0, total }],
        });
      }
      const cols = { no: 1, date: 2, supplier: 3, total: 4, paid: 5, remaining: 6 };
      await goto(c.page, c.base, '/purchase-invoices');
      const searchBox = await c.page.$('input[placeholder="بحث..."]');

      await setInput(c.page, searchBox, tag); await wait();
      let info = await pager(c.page);
      if (!/صفحة 1 من 2 — 40 فاتورة/.test(info)) throw new Error(`paging line after search: "${info}", expected page 1 of 2 with 40`);
      if ((await tableRows(c.page, cols)).length !== 25) throw new Error('page 1 should hold 25 invoices');
      await clickButton(c.page, 'التالي'); await wait();
      if ((await tableRows(c.page, cols)).length !== 15) throw new Error('page 2 should hold the remaining 15 invoices');
      const nextDisabled = await c.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'التالي').disabled);
      if (!nextDisabled) throw new Error('"next" is enabled on the last page');
      await clickButton(c.page, 'السابق'); await wait();
      if (!/صفحة 1 من 2/.test(await pager(c.page))) throw new Error('"previous" did not return to page 1');

      await setInput(c.page, searchBox, `${tag}-07`); await wait();
      let r = await tableRows(c.page, cols);
      if (r.length !== 1 || r[0].no !== `${tag}-07`) throw new Error('searching one invoice number should show exactly it: ' + JSON.stringify(r.map(x => x.no)));
      await setInput(c.page, searchBox, tag); await wait();

      const dateInputs = await c.page.$$('input[type="date"]');
      await setInput(c.page, dateInputs[0], '2026-04-01'); await wait();
      await setInput(c.page, dateInputs[1], '2026-04-30'); await wait();
      r = await tableRows(c.page, cols);
      if (!r.length || r.some(x => x.date !== '2026-04-10')) throw new Error('rows outside the date range are shown, or none are');

      await pickInHeader(c.page, 'المتبقي', 'عليه متبقي');
      r = await tableRows(c.page, cols);
      if (!r.length || r.some(x => num(x.remaining) <= 0)) throw new Error('the "open" filter shows invoices with nothing remaining');
      await pickInHeader(c.page, 'عليه متبقي', 'مسدد');
      r = await tableRows(c.page, cols);
      if (r.some(x => num(x.remaining) > 0)) throw new Error('the "paid" filter shows an invoice with a remainder');

      await clickButton(c.page, 'مسح الفلاتر', false); await wait();
      await setInput(c.page, searchBox, tag); await wait();
      if (!/40 فاتورة/.test(await pager(c.page))) throw new Error('after clearing the filters the 40 invoices should be back');
      const sortTotal = () => c.page.evaluate(() => [...document.querySelectorAll('thead th')].find(t => t.textContent.includes('الإجمالي')).querySelector('button').click());
      await sortTotal(); await wait();
      r = await tableRows(c.page, cols);
      if (num(r[0].total) !== 10) throw new Error(`sort ascending by total: first ${r[0].total}`);
      await sortTotal(); await wait();
      r = await tableRows(c.page, cols);
      if (num(r[0].total) !== 400) throw new Error(`sort descending by total: first ${r[0].total}, expected 400`);

      await clickButton(c.page, 'مسح الفلاتر', false); await wait();
      await pickInHeader(c.page, 'المورد', 'E2E تاجر قوائم ' + tag);
      if (!/40 فاتورة/.test(await pager(c.page))) throw new Error('the supplier filter should leave the 40 invoices');
      r = await tableRows(c.page, cols);
      if (r.some(x => !x.supplier.includes(tag))) throw new Error('the supplier filter shows another supplier');
    },
  },

  {
    name: 'قائمة إذون التسليم: بحث وفلاتر وترتيب',
    run: async (c) => {
      const tag = String(Date.now()).slice(-5);
      const customer = await c.api('POST', '/customers', { name: 'E2E زبون إذون ' + tag });
      const other = await c.api('POST', '/customers', { name: 'E2E زبون آخر ' + tag });
      const notes = [];
      const specs = [
        [customer, '2026-03-05', 100], [customer, '2026-04-10', 300], [customer, '2026-04-20', 200],
        [other, '2026-05-15', 400], [other, '2026-04-12', 50],
      ];
      for (const [cust, date, weight] of specs) {
        notes.push(await c.api('POST', '/delivery-notes', {
          date, customer_id: cust.id, warehouse_id: c.w1.id, items: [{ item_id: c.items.b.id, net_weight: weight, roll_count: 1 }],
        }));
      }
      // one of them delivered so the status filter has two groups
      await c.api('POST', `/delivery-notes/${notes[4].id}/deliver`, {
        invoice_no: 'E2E-DNL-' + tag, warehouse_id: c.w1.id, items: [{ item_id: c.items.b.id, price: 5, quantity: 1, weight: 50 }], payments: [],
      });
      const cols = { no: 0, date: 1, customer: 2, items: 3, weight: 4, status: 5 };
      await goto(c.page, c.base, '/delivery-notes');
      const searchBox = await c.page.$('input[placeholder*="بحث"]');

      // search by customer name: this tag's 5 notes
      await setInput(c.page, searchBox, tag); await wait();
      let r = await tableRows(c.page, cols);
      if (r.length !== 5) throw new Error(`search by the customer tag should show 5 notes, shows ${r.length}`);
      // the other customer only
      await setInput(c.page, searchBox, 'آخر ' + tag); await wait();
      r = await tableRows(c.page, cols);
      if (r.length !== 2 || r.some(x => !x.customer.includes('آخر'))) throw new Error('search by one customer name should show only that customer');
      await setInput(c.page, searchBox, tag); await wait();

      // date range April: notes dated 2026-04-xx = 3
      const dateInputs = await c.page.$$('input[type="date"]');
      await setInput(c.page, dateInputs[0], '2026-04-01'); await wait();
      await setInput(c.page, dateInputs[1], '2026-04-30'); await wait();
      r = await tableRows(c.page, cols);
      if (r.length !== 3 || r.some(x => !x.date.startsWith('2026-04'))) throw new Error('the April range should leave exactly the 3 April notes: ' + JSON.stringify(r.map(x => x.date)));

      // status filter inside April: 2 pending + 1 delivered
      await pickInHeader(c.page, 'الحالة', 'تم التسليم');
      r = await tableRows(c.page, cols);
      if (r.length !== 1 || !r[0].status.includes('تم التسليم')) throw new Error('the delivered filter should leave 1 delivered note');
      await pickInHeader(c.page, 'تم التسليم', 'معلق');
      r = await tableRows(c.page, cols);
      if (r.length !== 2 || r.some(x => !x.status.includes('معلق'))) throw new Error('the pending filter should leave the 2 pending April notes');

      // clear, then the customer filter and sorting by weight
      await clickButton(c.page, 'مسح الفلاتر', false); await wait();
      await setInput(c.page, searchBox, tag); await wait();
      await pickInHeader(c.page, 'العميل', 'E2E زبون إذون ' + tag);
      r = await tableRows(c.page, cols);
      if (r.length !== 3 || r.some(x => !x.customer.includes('إذون'))) throw new Error('the customer filter should leave that customer\'s 3 notes');
      const sortWeight = () => c.page.evaluate(() => [...document.querySelectorAll('thead th')].find(t => t.textContent.includes('إجمالي الوزن')).querySelector('button').click());
      await sortWeight(); await wait();
      r = await tableRows(c.page, cols);
      const weights = r.map(x => num(x.weight));
      if (JSON.stringify(weights) !== JSON.stringify([100, 200, 300])) throw new Error('sort ascending by weight gave ' + weights.join(','));
      await sortWeight(); await wait();
      const desc = (await tableRows(c.page, cols)).map(x => num(x.weight));
      if (JSON.stringify(desc) !== JSON.stringify([300, 200, 100])) throw new Error('sort descending by weight gave ' + desc.join(','));
    },
  },

  {
    name: 'تقرير حركة الصنف: مخزن وتاريخ ونوع ورصيد متحرك',
    run: async (c) => {
      const code = 'E2E-MV-' + String(Date.now()).slice(-5);
      const item = await c.api('POST', '/items', { code, name: 'E2E صنف حركة ' + code.slice(-5), unit: 'كيلو', purchase_price: 3, is_stockable: true });
      const mv = (warehouse, type, date, weight, quantity) => c.api('POST', '/stock/adjustments', { item_id: item.id, warehouse_id: warehouse.id, movement_type: type, date, weight, quantity, description: 'E2E حركة' });
      await mv(c.w1, 'إضافة', '2026-03-01', 100, 10);
      await mv(c.w1, 'إضافة', '2026-04-01', 50, 5);
      await mv(c.w1, 'صرف', '2026-04-15', 30, 3);
      await mv(c.w2, 'إضافة', '2026-05-01', 200, 20);
      const cols = { date: 0, type: 1, warehouse: 2, inW: 4, outW: 6, balW: 8 };

      await goto(c.page, c.base, '/reports/item-movement');
      await field(c.page, 'الصنف', code);
      await wait();
      let r = await tableRows(c.page, cols);
      if (r.length !== 4) throw new Error(`all movements: expected 4 rows, got ${r.length}`);
      // the running balance after the last row is the sum across both warehouses (100+50-30+200)
      if (num(r[r.length - 1].balW) !== 320) throw new Error(`running balance after the last movement is ${r[r.length - 1].balW}, expected 320`);

      // warehouse filter
      await field(c.page, 'المخزن', 'E2E مخزن 2'); await wait();
      r = await tableRows(c.page, cols);
      if (r.length !== 1 || !r[0].warehouse.includes('مخزن 2') || num(r[0].inW) !== 200) throw new Error('the warehouse filter should leave only the warehouse 2 receipt');
      await field(c.page, 'المخزن', 'E2E مخزن 1'); await wait();
      r = await tableRows(c.page, cols);
      if (r.length !== 3) throw new Error(`warehouse 1 should have 3 movements, has ${r.length}`);
      if (num(r[r.length - 1].balW) !== 120) throw new Error(`warehouse 1 balance after the last movement is ${r[r.length - 1].balW}, expected 120`);

      // date range inside warehouse 1: a from-date turns the earlier movements into one
      // "opening balance" row (100 kg from March), then the April receipt and issue
      const dateInputs = await c.page.$$('input[type="date"]');
      await setInput(c.page, dateInputs[0], '2026-04-01'); await wait();
      r = await tableRows(c.page, cols);
      const openingText = await c.page.evaluate(() => document.querySelector('tbody tr').textContent);
      if (r.length !== 3 || !r[0].date.includes('رصيد سابق') || !/100/.test(openingText)) throw new Error('the from-date should fold March into an opening balance row of 100: ' + openingText);
      if (r[1].date !== '2026-04-01' || r[2].date !== '2026-04-15' || num(r[2].balW) !== 120) throw new Error('the April movements and their running balance are wrong: ' + JSON.stringify(r.map(x => [x.date, x.balW])));
      await setInput(c.page, dateInputs[1], '2026-04-10'); await wait();
      r = await tableRows(c.page, cols);
      if (r.length !== 2 || !r[0].date.includes('رصيد سابق') || r[1].date !== '2026-04-01' || num(r[1].balW) !== 150) throw new Error('the to-date should leave the opening row and the 2026-04-01 receipt (balance 150): ' + JSON.stringify(r.map(x => [x.date, x.balW])));

      // type filter after clearing the dates
      await setInput(c.page, dateInputs[0], ''); await setInput(c.page, dateInputs[1], ''); await wait();
      await pickInHeader(c.page, 'نوع الحركة', 'صرف');
      r = await tableRows(c.page, cols);
      if (r.length !== 1 || !r[0].type.includes('صرف') || num(r[0].outW) !== 30) throw new Error('the type filter should leave only the 30 kg issue');
    },
  },
];

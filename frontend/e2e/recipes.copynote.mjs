// Delivery note: start a new note from an earlier note of the same customer.

import { goto, clickText, field, fieldValue, save, sleep, eventually } from './lib.mjs';

const labels = (page) => page.evaluate(() => [...document.querySelectorAll('label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()));

export const copyNoteRecipes = [
  {
    name: 'إذن تسليم: نسخ من إذن سابق',
    run: async (c) => {
      const tag = String(Date.now()).slice(-5);
      const customer = await c.api('POST', '/customers', { name: 'E2E زبون نسخ ' + tag });
      const stranger = await c.api('POST', '/customers', { name: 'E2E زبون بلا اذون ' + tag });
      const old = await c.api('POST', '/delivery-notes', {
        date: '2026-03-01', customer_id: customer.id, warehouse_id: c.w1.id, driver_name: 'سائق قديم', car_no: 'س ص 123',
        items: [
          { item_id: c.items.a.id, net_weight: 120, roll_count: 6, batch_no: 'B-OLD-1', product_description: 'وصف أ' },
          { item_id: c.items.b.id, net_weight: 80, roll_count: 4, batch_no: 'B-OLD-2', product_description: 'وصف ب' },
        ],
      });
      const notesOf = async () => (await c.api('GET', '/delivery-notes')).filter(n => n.customer_id === customer.id);

      // a customer with no earlier note gets no copy box
      await goto(c.page, c.base, '/delivery-notes');
      await clickText(c.page, 'إذن تسليم جديد');
      await field(c.page, 'العميل', 'E2E زبون بلا اذون ' + tag);
      await sleep(300);
      if ((await labels(c.page)).some(l => l.startsWith('نسخ من إذن سابق'))) throw new Error('the copy box shows for a customer without earlier notes');

      // the customer with an earlier note: pick it, the lines are copied
      await field(c.page, 'العميل', 'E2E زبون نسخ ' + tag);
      await sleep(300);
      if (!(await labels(c.page)).some(l => l.startsWith('نسخ من إذن سابق'))) throw new Error('the copy box is missing for a customer with an earlier note');
      await field(c.page, 'نسخ من إذن سابق', `(${old.note_no})`);
      await sleep(500);
      const weights = [Number(await fieldValue(c.page, 'الوزن الصافي', 0)), Number(await fieldValue(c.page, 'الوزن الصافي', 1))];
      if (weights[0] !== 120 || weights[1] !== 80) throw new Error('the copied weights are ' + weights.join(', ') + ', expected 120, 80');
      if (await fieldValue(c.page, 'رقم الباتش', 0) !== '') throw new Error('the batch number should not be copied');
      if (await fieldValue(c.page, 'تعريف المنتج', 1) !== 'وصف ب') throw new Error('the product description was not copied');
      if (await fieldValue(c.page, 'اسم السائق') !== 'سائق قديم') throw new Error('the driver was not copied');
      // the date is today, not the old note's date
      if (await fieldValue(c.page, 'التاريخ') !== c.today) throw new Error('the copied note should be dated today');
      await save(c.page, c.w, 'حفظ');
      await eventually(async () => (await notesOf()).length === 2, 'the copied note was not saved');
      const fresh = (await notesOf()).find(n => n.id !== old.id);
      if (fresh.note_no === old.note_no) throw new Error('the new note reuses the old note number');
      const kg = (fresh.items || []).map(i => Number(i.net_weight)).sort((x, y) => x - y);
      if (kg.join(',') !== '80,120') throw new Error('the new note has weights ' + kg.join(','));
      void stranger;
    },
  },
];

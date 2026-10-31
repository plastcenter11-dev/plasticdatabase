// More screens: opening balances, opening inventory (first-period count),
// employees + the commissions report, supplier edit/delete and a draft purchase
// invoice edit/delete.

import { goto, clickText, field, save, settle, sleep, eventually } from './lib.mjs';
import { rowAction, search } from './recipes.editdelete.mjs';
import { setInput, wait } from './recipes.lists.mjs';

const customerBalance = async (c, id) => Number((await c.api('GET', '/customers')).find(x => x.id === id).balance);

export const more2Recipes = [
  {
    name: 'رصيد افتتاحي لعميل يظهر في رصيده ويُحذف',
    run: async (c) => {
      const cust = await c.api('POST', '/customers', { name: 'E2E زبون افتتاحي' });
      const before = await customerBalance(c, cust.id);
      await goto(c.page, c.base, '/opening-balances');
      await clickText(c.page, 'رصيد جديد');
      await field(c.page, 'العميل', 'E2E زبون افتتاحي');
      await field(c.page, 'مدين', 750);
      await save(c.page, c.w);
      const after = await customerBalance(c, cust.id);
      if (after - before !== 750) throw new Error(`the customer balance moved by ${after - before}, expected +750`);
      await rowAction(c.page, 'E2E زبون افتتاحي', 'delete');
      await settle(c.page, c.w, 1200);
      if (await customerBalance(c, cust.id) !== before) throw new Error('deleting the opening balance did not restore the customer balance');
    },
  },

  {
    name: 'جرد أول المدة يضبط رصيد المخزن',
    run: async (c) => {
      const code = 'E2E-OI-' + String(Date.now()).slice(-5);
      const item = await c.api('POST', '/items', { code, name: 'E2E صنف جرد افتتاحي ' + code.slice(-5), unit: 'كيلو', purchase_price: 7, is_stockable: true });
      await goto(c.page, c.base, '/opening-inventory');
      await field(c.page, 'المخزن', 'E2E مخزن 2');
      await sleep(1500);
      const set = await c.page.evaluate((code) => {
        const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(code));
        if (!tr) return false;
        const [qty, weight] = tr.querySelectorAll('input[type="number"]');
        const write = (e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); };
        write(qty, '12'); write(weight, '340');
        return true;
      }, code);
      if (!set) throw new Error('the new item is not listed on the opening inventory screen');
      await clickText(c.page, 'حفظ الجرد');
      await sleep(4000);
      const row = (await c.api('GET', '/stock/items-stock')).find(r => r.item_id === item.id);
      const here = row && row.warehouses.find(w => w.warehouse_id === c.w2.id);
      if (!here || Number(here.weight) !== 340 || Number(here.quantity) !== 12) throw new Error('the counted 12 / 340 kg is not the warehouse balance: ' + JSON.stringify(here));
      // counting again with other figures replaces, not adds
      await goto(c.page, c.base, '/opening-inventory');
      await field(c.page, 'المخزن', 'E2E مخزن 2');
      await sleep(1500);
      await c.page.evaluate((code) => {
        const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(code));
        const [qty, weight] = tr.querySelectorAll('input[type="number"]');
        const write = (e, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); };
        write(qty, '5'); write(weight, '100');
      }, code);
      await clickText(c.page, 'حفظ الجرد');
      await sleep(4000);
      const again = (await c.api('GET', '/stock/items-stock')).find(r => r.item_id === item.id).warehouses.find(w => w.warehouse_id === c.w2.id);
      if (Number(again.weight) !== 100 || Number(again.quantity) !== 5) throw new Error('a second count should replace the balance: ' + JSON.stringify(again));
    },
  },

  {
    name: 'موظف: إضافة وتعديل وحذف',
    run: async (c) => {
      await goto(c.page, c.base, '/employees');
      await clickText(c.page, 'إضافة موظف').catch(async () => { await clickText(c.page, 'جديد'); });
      await field(c.page, 'الاسم', 'E2E موظف مؤقت');
      await field(c.page, 'نسبة العمولة', 4);
      await save(c.page, c.w);
      let emp = (await c.api('GET', '/employees')).find(e => e.name === 'E2E موظف مؤقت');
      if (!emp || Number(emp.commission_rate) !== 4) throw new Error('the employee was not saved with a 4% commission');
      await rowAction(c.page, 'E2E موظف مؤقت', 'edit');
      await field(c.page, 'نسبة العمولة', 6);
      await save(c.page, c.w);
      await eventually(async () => Number((await c.api('GET', '/employees')).find(e => e.id === emp.id).commission_rate) === 6, 'the commission was not changed to 6%');
      await rowAction(c.page, 'E2E موظف مؤقت', 'delete');
      await settle(c.page, c.w, 1200);
      await eventually(async () => !(await c.api('GET', '/employees')).some(e => e.id === emp.id), 'the employee was not deleted');
    },
  },

  {
    name: 'تقرير عمولة المندوبين يحسب من المبيعات',
    run: async (c) => {
      const emp = await c.api('POST', '/employees', { name: 'E2E مندوب عمولة', commission_rate: 5 });
      const mk = (no, total) => c.api('POST', '/sales-invoices', {
        customer_id: c.customer.id, employee_id: emp.id, warehouse_id: c.w1.id, invoice_no: no, date: '2026-06-10',
        subtotal: total, total, paid: total, remaining: 0,
        items: [{ item_id: c.items.a.id, quantity: 1, weight: 10, price: total / 10, discount: 0, total }],
      });
      const posted = await mk('E2E-CM-1-' + Date.now(), 1000);
      await c.api('POST', `/sales-invoices/${posted.id}/post`);
      await mk('E2E-CM-2-' + Date.now(), 500); // stays a draft
      await goto(c.page, c.base, '/employee-commissions');
      await field(c.page, 'المندوب', 'E2E مندوب عمولة');
      const dates = await c.page.$$('input[type="date"]');
      await setInput(c.page, dates[0], '2026-06-01');
      await setInput(c.page, dates[1], '2026-06-30');
      await clickText(c.page, 'عرض');
      await wait();
      const text = await c.page.evaluate(() => document.body.innerText);
      // 5% of the posted 1,000 = 50. A draft is not a sale yet, so its 500 must not count.
      if (!/E2E مندوب عمولة/.test(text)) throw new Error('the employee is not in the commissions report');
      if (/75/.test(text.split('E2E مندوب عمولة')[1] || '') && !/(^|\D)50(\D|$)/.test(text.split('E2E مندوب عمولة')[1])) throw new Error('commission looks computed on posted + draft (75) instead of posted only (50)');
      if (!/(^|\D)50(\D|$)/.test(text.split('E2E مندوب عمولة')[1])) throw new Error('the commission of 50 (5% of the posted 1,000) is not shown');
      if (/(^|\D)1,?500(\D|$)/.test(text)) throw new Error('total sales include the draft invoice (1,500 instead of 1,000)');
    },
  },

  {
    name: 'مورد: تعديل وحذف',
    run: async (c) => {
      const sup = await c.api('POST', '/suppliers', { name: 'E2E تاجر للحذف' });
      await goto(c.page, c.base, '/suppliers');
      await search(c.page, 'E2E تاجر للحذف');
      await rowAction(c.page, 'E2E تاجر للحذف', 'edit');
      await field(c.page, 'الهاتف', '0111222');
      await save(c.page, c.w);
      if ((await c.api('GET', '/suppliers')).find(s => s.id === sup.id).phone !== '0111222') throw new Error('the phone was not saved');
      await search(c.page, 'E2E تاجر للحذف');
      await rowAction(c.page, 'E2E تاجر للحذف', 'delete');
      await settle(c.page, c.w, 1200);
      if ((await c.api('GET', '/suppliers')).some(s => s.id === sup.id)) throw new Error('the supplier was not deleted');
    },
  },

  {
    name: 'فاتورة شراء مسودة: تعديل وحذف',
    run: async (c) => {
      const no = 'E2E-PD-' + Date.now();
      const inv = await c.api('POST', '/purchase-invoices', {
        supplier_id: c.supplier.id, warehouse_id: c.w1.id, invoice_no: no, date: c.today, subtotal: 100, total: 100, paid: 0, remaining: 100,
        items: [{ item_id: c.items.a.id, quantity: 1, weight: 10, price: 10, discount: 0, total: 100 }],
      });
      await goto(c.page, c.base, '/purchase-invoices');
      await search(c.page, no);
      await rowAction(c.page, no, 'edit');
      await field(c.page, 'المدفوع', 40);
      await save(c.page, c.w);
      if (Number((await c.api('GET', '/purchase-invoices')).find(i => i.id === inv.id).paid) !== 40) throw new Error('paid was not changed to 40');
      await search(c.page, no);
      await rowAction(c.page, no, 'delete');
      await settle(c.page, c.w, 1200);
      if ((await c.api('GET', '/purchase-invoices')).some(i => i.id === inv.id)) throw new Error('the draft purchase invoice was not deleted');
    },
  },
];

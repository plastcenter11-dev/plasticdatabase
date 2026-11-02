// The system options in the browser: the settings tab saves them, and the invoice
// screens, posting and the record protection date behave as chosen. Options are
// switched through the API for set-up and always put back afterwards.

import { goto, clickText, field, fieldValue, cell, save, settle, sleep, eventually } from './lib.mjs';
import { search, rowAction } from './recipes.editdelete.mjs';

const KEYS = ['opt_credit_no_limit', 'opt_auto_tax', 'opt_block_below_cost', 'opt_auto_numbering', 'opt_require_approval', 'protect_until'];

// run `fn` with the given options, then restore what was set before
async function withOptions(c, values, fn) {
  const before = await c.api('GET', '/options');
  const restore = Object.fromEntries(KEYS.map(k => [k, before[k]]));
  await c.api('PUT', '/settings', values);
  try { await fn(); } finally { await c.api('PUT', '/settings', restore); }
}

const toast = (page, kind = 'error') => page.evaluate((kind) => [...document.querySelectorAll(`.Toastify__toast--${kind}`)].map(t => t.textContent.trim()).join(' | '), kind);
const labels = (page) => page.evaluate(() => [...document.querySelectorAll('[data-enter-scope] label, .modal label, label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()));

const draft = (c, extra = {}) => c.api('POST', '/sales-invoices', {
  customer_id: c.customer.id, warehouse_id: c.w1.id, invoice_no: 'E2E-OPT-' + Date.now() + Math.floor(Math.random() * 100), date: c.today,
  subtotal: 100, total: 100, paid: 100, remaining: 0,
  items: [{ item_id: c.items.a.id, quantity: 1, weight: 10, price: 10, discount: 0, total: 100 }], ...extra,
});

// fill the new-invoice form's customer, warehouse and one line (weight, roll count, price)
async function fillInvoice(c, price = 20) {
  await field(c.page, 'العميل', 'E2E عميل'); await field(c.page, 'المخزن', 'E2E مخزن 1');
  await cell(c.page, 0, 0, 0, 'E2E صنف أ'); await cell(c.page, 0, 0, 1, 10); await cell(c.page, 0, 0, 2, 1); await cell(c.page, 0, 0, 3, price);
}

export const optionsRecipes = [
  {
    name: 'الخيارات: التبويب يحفظ الاختيارات',
    run: async (c) => {
      await withOptions(c, { opt_block_below_cost: '0', opt_require_approval: '0' }, async () => {
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'خيارات');
        const toggle = (text) => c.page.evaluate((text) => { [...document.querySelectorAll('label')].find(l => l.textContent.includes(text)).querySelector('input').click(); }, text);
        await toggle('منع البيع بأقل من سعر التكلفة');
        await toggle('طلب اعتماد الفواتير قبل الترحيل');
        await clickText(c.page, 'حفظ');
        await eventually(async () => { const o = await c.api('GET', '/options'); return o.opt_block_below_cost === '1' && o.opt_require_approval === '1'; }, 'the two options were not saved');
        // they are still ticked after a reload
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'خيارات');
        const ticked = await c.page.evaluate(() => Object.fromEntries(['منع البيع بأقل من سعر التكلفة', 'طلب اعتماد الفواتير قبل الترحيل', 'ترقيم الفواتير تلقائياً'].map(t => [t, [...document.querySelectorAll('label')].find(l => l.textContent.includes(t)).querySelector('input').checked])));
        if (!ticked['منع البيع بأقل من سعر التكلفة'] || !ticked['طلب اعتماد الفواتير قبل الترحيل']) throw new Error('the saved options are not ticked after a reload: ' + JSON.stringify(ticked));
        if (!ticked['ترقيم الفواتير تلقائياً']) throw new Error('an option nobody touched lost its default');
      });
    },
  },

  {
    name: 'الخيارات: الترقيم اليدوي للفواتير',
    run: async (c) => {
      await withOptions(c, { opt_auto_numbering: '1' }, async () => {
        await goto(c.page, c.base, '/sales-invoices');
        await clickText(c.page, 'فاتورة جديدة');
        if ((await labels(c.page)).some(l => l.startsWith('رقم الفاتورة'))) throw new Error('the invoice number field shows although numbering is automatic');
      });
      await withOptions(c, { opt_auto_numbering: '0' }, async () => {
        const no = 'E2E-MAN-' + Date.now();
        await goto(c.page, c.base, '/sales-invoices');
        await clickText(c.page, 'فاتورة جديدة');
        if (!(await labels(c.page)).some(l => l.startsWith('رقم الفاتورة'))) throw new Error('the invoice number field is missing although numbering is manual');
        await fillInvoice(c);
        const countBefore = (await c.api('GET', '/sales-invoices')).length;
        // without a number the form refuses to submit
        await c.page.evaluate(() => [...document.querySelectorAll('[data-enter-scope] button')].find(b => b.textContent.includes('حفظ')).click());
        await sleep(1200);
        if ((await c.api('GET', '/sales-invoices')).length !== countBefore) throw new Error('an invoice was saved without a typed number');
        await field(c.page, 'رقم الفاتورة', no);
        await save(c.page, c.w);
        await eventually(async () => (await c.api('GET', '/sales-invoices')).some(i => i.invoice_no === no), 'the typed number was not used');
      });
    },
  },

  {
    name: 'الخيارات: نسبة الضريبة الافتراضية',
    run: async (c) => {
      const taxField = async () => { await goto(c.page, c.base, '/sales-invoices'); await clickText(c.page, 'فاتورة جديدة'); return fieldValue(c.page, 'نسبة الضريبة'); };
      await withOptions(c, { opt_auto_tax: '0' }, async () => {
        const v = await taxField();
        if (Number(v) !== 0) throw new Error(`with automatic tax off the new invoice starts with ${v}%`);
      });
      await withOptions(c, { opt_auto_tax: '1' }, async () => {
        await sleep(300);
        const v = await taxField();
        if (Number(v) !== 14) throw new Error(`with automatic tax on the new invoice starts with ${v}%, expected 14`);
      });
    },
  },

  {
    name: 'الخيارات: اعتماد الفاتورة قبل الترحيل',
    run: async (c) => {
      await withOptions(c, { opt_require_approval: '1' }, async () => {
        const inv = await draft(c);
        await goto(c.page, c.base, '/sales-invoices');
        await search(c.page, inv.invoice_no);
        const rowText = () => c.page.evaluate((no) => [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no))?.textContent || '', inv.invoice_no);
        if (!(await rowText()).includes('اعتماد')) throw new Error('an unapproved draft has no approve button');
        // posting before approval is refused
        await c.page.evaluate((no) => [...[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no)).querySelectorAll('button')].find(b => b.textContent.includes('ترحيل')).click(), inv.invoice_no);
        await sleep(1200);
        if (!(await toast(c.page)).includes('اعتماد')) throw new Error('posting an unapproved invoice did not show the approval message: ' + await toast(c.page));
        if ((await c.api('GET', `/sales-invoices/${inv.id}`)).status !== 'draft') throw new Error('the unapproved invoice was posted');
        // approve, then post
        await c.page.evaluate((no) => [...[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no)).querySelectorAll('button')].find(b => b.textContent.trim() === 'اعتماد').click(), inv.invoice_no);
        await eventually(async () => (await rowText()).includes('معتمدة'), 'the row does not show "معتمدة" after approving');
        await c.page.evaluate((no) => [...[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no)).querySelectorAll('button')].find(b => b.textContent.includes('ترحيل')).click(), inv.invoice_no);
        await eventually(async () => (await c.api('GET', `/sales-invoices/${inv.id}`)).status === 'posted', 'the approved invoice was not posted');
      });
    },
  },

  {
    name: 'الخيارات: منع البيع بأقل من التكلفة',
    run: async (c) => {
      await withOptions(c, { opt_block_below_cost: '1' }, async () => {
        const countBefore = (await c.api('GET', '/sales-invoices')).length;
        await goto(c.page, c.base, '/sales-invoices');
        await clickText(c.page, 'فاتورة جديدة');
        await fillInvoice(c, 5); // the item costs 10
        let message = '';
        try { await save(c.page, c.w); } catch (e) { message = e.message; }
        if (!message.includes('سعر التكلفة')) throw new Error('a sale under cost was not refused with the cost message: "' + message + '"');
        if ((await c.api('GET', '/sales-invoices')).length !== countBefore) throw new Error('the below-cost invoice was saved');
        // a price at cost is accepted
        await c.page.evaluate(() => document.querySelectorAll('.Toastify__toast').forEach(t => t.remove()));
        await cell(c.page, 0, 0, 3, 10);
        await save(c.page, c.w);
        await eventually(async () => (await c.api('GET', '/sales-invoices')).length === countBefore + 1, 'the invoice at cost was not saved');
      });
    },
  },

  {
    name: 'الخيارات: بيع آجل لعميل بدون حد ائتمان',
    run: async (c) => {
      await withOptions(c, { opt_credit_no_limit: '0' }, async () => {
        const noLimit = await c.api('POST', '/customers', { name: 'E2E زبون بلا حد' });
        const inv = await draft(c, { customer_id: noLimit.id, paid: 0, remaining: 100 });
        await goto(c.page, c.base, '/sales-invoices');
        await search(c.page, inv.invoice_no);
        await c.page.evaluate((no) => [...[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no)).querySelectorAll('button')].find(b => b.textContent.includes('ترحيل')).click(), inv.invoice_no);
        await sleep(1200);
        if (!(await toast(c.page)).includes('حد ائتمان')) throw new Error('posting a credit sale to a customer with no limit was not refused: ' + await toast(c.page));
        if ((await c.api('GET', `/sales-invoices/${inv.id}`)).status !== 'draft') throw new Error('the credit invoice was posted');
        // once the customer has a limit the same invoice posts
        await c.api('PUT', `/customers/${noLimit.id}`, { credit_limit: 5000 });
        await c.page.evaluate(() => document.querySelectorAll('.Toastify__toast').forEach(t => t.remove()));
        await c.page.evaluate((no) => [...[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(no)).querySelectorAll('button')].find(b => b.textContent.includes('ترحيل')).click(), inv.invoice_no);
        await eventually(async () => (await c.api('GET', `/sales-invoices/${inv.id}`)).status === 'posted', 'the invoice did not post after the customer got a credit limit');
      });
    },
  },

  {
    name: 'الخيارات: حماية السجلات وإلغاؤها من الشاشة',
    run: async (c) => {
      await withOptions(c, { protect_until: '' }, async () => {
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'حماية السجلات');
        const dateInput = await c.page.$('input[type="date"]');
        await dateInput.evaluate((e) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2026-05-31'); e.dispatchEvent(new Event('input', { bubbles: true })); });
        await clickText(c.page, 'تفعيل الحماية');
        await eventually(async () => (await c.api('GET', '/options')).protect_until === '2026-05-31', 'the protection date was not saved');
        if (!(await c.page.evaluate(() => document.body.innerText)).includes('الحماية مفعّلة حتى 2026-05-31')) throw new Error('the screen does not say the protection is on');

        // an expense dated inside the protected period is refused, the message says why
        await goto(c.page, c.base, '/expenses');
        await clickText(c.page, 'مصروف جديد');
        await field(c.page, 'التاريخ', '2026-05-01'); await field(c.page, 'الوصف', 'E2E مصروف محمي'); await field(c.page, 'المبلغ', 7);
        let message = '';
        try { await save(c.page, c.w); } catch (e) { message = e.message; }
        if (!message.includes('محمية')) throw new Error('an expense inside the protected period was not refused with the protection message: "' + message + '"');
        if ((await c.api('GET', '/finance/expenses')).some(x => x.description === 'E2E مصروف محمي')) throw new Error('the protected-period expense was saved');

        // lifting the protection
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'إلغاء حماية');
        await clickText(c.page, 'إلغاء الحماية');
        await eventually(async () => (await c.api('GET', '/options')).protect_until === '', 'the protection date was not cleared');
        await goto(c.page, c.base, '/expenses');
        await clickText(c.page, 'مصروف جديد');
        await field(c.page, 'التاريخ', '2026-05-01'); await field(c.page, 'الوصف', 'E2E مصروف محمي'); await field(c.page, 'المبلغ', 7);
        await save(c.page, c.w);
        await eventually(async () => (await c.api('GET', '/finance/expenses')).some(x => x.description === 'E2E مصروف محمي'), 'the expense was not saved after lifting the protection');
      });
    },
  },
];
void settle; void rowAction;

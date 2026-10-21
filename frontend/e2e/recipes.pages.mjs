// Read-only recipes: every screen opens without a failed request, a page error
// or an error toast, and the reports show the data the earlier recipes created.

import { goto, field, sleep, settle } from './lib.mjs';

const ROUTES = [
  '/', '/items', '/items-non-stock', '/opening-inventory', '/stock-adjustments', '/stock-issue', '/stock-receive',
  '/warehouse-transfers', '/item-assembly', '/reorder-level', '/warehouse-items', '/item-inquiry',
  '/delivery-notes', '/sales-invoices', '/sales-returns', '/purchase-invoices', '/purchase-returns',
  '/customers', '/suppliers', '/opening-balances', '/customer-credit-limits',
  '/reports/customer-statement', '/reports/supplier-statement', '/reports/customers', '/reports/suppliers',
  '/cash-receipts', '/cash-payments', '/checks', '/supplier-checks', '/reports/overdue-checks',
  '/expenses', '/other-income', '/reports/expenses', '/employees', '/employee-commissions', '/warehouses',
  '/document-cycle', '/reports/item-movement', '/reports/reorder',
  '/settings/options', '/users', '/settings/change-password', '/settings/backup', '/settings/company', '/financial-years',
];

const pageText = (page) => page.evaluate(() => (document.querySelector('main') || document.body).innerText);

export const pageRecipes = [
  {
    name: 'كل الشاشات تفتح بلا أخطاء',
    run: async (c) => {
      const problems = [];
      for (const route of ROUTES) {
        c.w.reset();
        await goto(c.page, c.base, route);
        try { await settle(c.page, c.w, 300); } catch (e) { problems.push(`${route}: ${e.message}`); continue; }
        const text = await pageText(c.page);
        if (!text.trim()) problems.push(`${route}: the screen is blank`);
        if (c.page.url().includes('/login')) problems.push(`${route}: bounced to the login page`);
        if (c.w.pageErrors.length) problems.push(`${route}: page error ${c.w.pageErrors.join(' | ')}`);
      }
      if (problems.length) throw new Error(`${problems.length} screen(s) with problems:\n         ` + problems.join('\n         '));
    },
  },
  {
    name: 'كشف حساب عميل يعرض الحركات',
    run: async (c) => {
      await goto(c.page, c.base, '/reports/customer-statement');
      await c.page.evaluate(() => { document.querySelector('input.erp-select').focus(); });
      const select = await c.page.$('input.erp-select');
      await select.click(); await sleep(150); await select.type('E2E عميل', { delay: 15 }); await sleep(250); await c.page.keyboard.press('Enter');
      await sleep(1200);
      const text = await pageText(c.page);
      if (!text.includes('فاتورة بيع')) throw new Error('the statement does not list the sales invoice');
      if (!text.includes('تحصيل')) throw new Error('the statement does not list the receipts');
      // the two balance columns are shown
      if (!text.includes('رصيد مدين') || !text.includes('رصيد دائن')) throw new Error('the debit / credit balance columns are missing');
    },
  },
  {
    name: 'كشف حساب مورد يعرض الحركات',
    run: async (c) => {
      await goto(c.page, c.base, '/reports/supplier-statement');
      const select = await c.page.$('input.erp-select');
      await select.click(); await sleep(150); await select.type('E2E مورد', { delay: 15 }); await sleep(250); await c.page.keyboard.press('Enter');
      await sleep(1200);
      const text = await pageText(c.page);
      if (!text.includes('فاتورة شراء')) throw new Error('the statement does not list the purchase invoice');
      if (!text.includes('دفع')) throw new Error('the statement does not list the payments');
    },
  },
  {
    name: 'حركة صنف تعرض الحركات',
    run: async (c) => {
      await goto(c.page, c.base, `/reports/item-movement?item_id=${c.items.a.id}`);
      await sleep(1000);
      const text = await pageText(c.page);
      for (const t of ['فاتورة شراء', 'فاتورة بيع', 'تحويل']) {
        if (!text.includes(t)) throw new Error(`the movement report does not show a "${t}" row`);
      }
    },
  },
];

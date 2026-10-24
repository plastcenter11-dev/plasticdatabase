// Financial years: create two (far in the past so no other recipe's documents fall
// inside), close one through the screen, check that documents dated inside it are
// refused, reopen it, check they are accepted again, then put things back.

import { goto, clickText, field, save, settle, sleep } from './lib.mjs';

const refused = async (fn) => {
  try { await fn(); } catch (e) { return e.message; }
  return null;
};

export const yearRecipes = [
  {
    name: 'السنة المالية: إقفال وقفل المستندات وإعادة فتح',
    run: async (c) => {
      const years = () => c.api('GET', '/financial-years');
      const originalActive = (await years()).find(y => y.is_active);
      const cleanup = async () => {
        for (const y of (await years()).filter(y => y.name.startsWith('E2E سنة'))) {
          if (y.is_closed) await c.api('POST', `/financial-years/${y.id}/reopen`);
        }
        if (originalActive) await c.api('POST', `/financial-years/${originalActive.id}/activate`);
        for (const y of (await years()).filter(y => y.name.startsWith('E2E سنة'))) { if (y.is_active) await c.api('PUT', `/financial-years/${y.id}`, { is_active: false }); await c.api('DELETE', `/financial-years/${y.id}`); }
      };
      try {
        // 1. both years through the form
        for (const [name, y] of [['E2E سنة 2001', 2001], ['E2E سنة 2002', 2002]]) {
          await goto(c.page, c.base, '/financial-years');
          await clickText(c.page, 'إضافة سنة');
          await field(c.page, 'المسمى', name);
          await field(c.page, 'تاريخ البداية', `${y}-01-01`); await field(c.page, 'تاريخ النهاية', `${y}-12-31`);
          await save(c.page, c.w);
        }
        const y1 = (await years()).find(y => y.name === 'E2E سنة 2001');
        const y2 = (await years()).find(y => y.name === 'E2E سنة 2002');
        if (!y1 || !y2) throw new Error('the two years were not created');

        // 2. make 2001 the current year and close it from the screen, moving to 2002
        await c.api('POST', `/financial-years/${y1.id}/activate`);
        await goto(c.page, c.base, '/financial-years');
        await clickText(c.page, 'إقفال السنة الحالية');
        await field(c.page, 'السنة المالية الجديدة', 'E2E سنة 2002');
        await clickText(c.page, 'تأكيد الإقفال');
        await sleep(1500);
        let now = await years();
        if (!now.find(y => y.id === y1.id).is_closed) throw new Error('2001 is not closed after the closing');
        if (now.find(y => y.id === y1.id).is_active) throw new Error('2001 is still the active year');
        if (!now.find(y => y.id === y2.id).is_active) throw new Error('2002 did not become the active year');

        // 3. documents dated in the closed year are refused (API) and the screen says why
        const expense = { date: '2001-06-01', description: 'E2E مصروف سنة مقفولة', amount: 10 };
        const msg = await refused(() => c.api('POST', '/finance/expenses', expense));
        if (!msg || !/مقفولة/.test(msg)) throw new Error('an expense in the closed year was not refused with the closed-year message: ' + msg);
        const msg2 = await refused(() => c.api('POST', '/finance/cash-receipts', { date: '2001-06-01', customer_id: c.customer.id, amount: 5, payment_method: 'نقدي' }));
        if (!msg2 || !/مقفولة/.test(msg2)) throw new Error('a receipt in the closed year was not refused: ' + msg2);
        await goto(c.page, c.base, '/expenses');
        await clickText(c.page, 'مصروف جديد');
        await field(c.page, 'التاريخ', '2001-06-01'); await field(c.page, 'الوصف', 'E2E مصروف سنة مقفولة'); await field(c.page, 'المبلغ', 10);
        const shown = await save(c.page, c.w).then(() => null, e => e.message);
        if (!shown || !/مقفولة/.test(shown)) throw new Error('the screen did not explain the closed year, it showed: ' + shown);
        await c.page.keyboard.press('Escape');
        if ((await c.api('GET', '/finance/expenses')).some(x => x.description === 'E2E مصروف سنة مقفولة')) throw new Error('the refused expense was saved anyway');

        // 4. a date outside the closed year is still fine
        await c.api('POST', '/finance/expenses', { date: c.today, description: 'E2E مصروف عادي', amount: 1 });

        // 5. reopen from the screen, and the same expense is accepted
        c.w.reset();
        await goto(c.page, c.base, '/financial-years');
        await c.page.evaluate(() => {
          const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E2E سنة 2001'));
          [...tr.querySelectorAll('button')].find(b => b.textContent.includes('إعادة فتح')).click();
        });
        await settle(c.page, c.w, 1500);
        if ((await years()).find(y => y.id === y1.id).is_closed) throw new Error('2001 is still closed after reopening');
        await c.api('POST', '/finance/expenses', expense);
      } finally {
        await cleanup();
        for (const e of (await c.api('GET', '/finance/expenses')).filter(x => x.description === 'E2E مصروف سنة مقفولة')) await c.api('DELETE', `/finance/expenses/${e.id}`);
      }
    },
  },
];

// Narrow screens (phone width): every screen is opened at 390 px and the page
// itself must not scroll sideways (tables may scroll inside their own box), the
// content must be on screen, and the menu must still be reachable.

import { goto, settle, sleep } from './lib.mjs';

const ROUTES = [
  '/', '/items', '/customers', '/suppliers', '/warehouses', '/employees',
  '/stock-adjustments', '/stock-issue', '/stock-receive', '/warehouse-transfers', '/item-assembly', '/warehouse-items',
  '/delivery-notes', '/sales-invoices', '/sales-returns', '/purchase-invoices', '/purchase-returns',
  '/cash-receipts', '/cash-payments', '/checks', '/supplier-checks', '/expenses', '/other-income',
  '/reports/customer-statement', '/reports/supplier-statement', '/reports/customers', '/reports/suppliers',
  '/reports/item-movement', '/reports/reorder', '/reports/expenses',
  '/opening-balances', '/opening-inventory', '/customer-credit-limits', '/financial-years', '/users', '/settings/options',
];

const measure = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const main = document.querySelector('main');
  const rect = main ? main.getBoundingClientRect() : null;
  // the widest element that sticks out of the viewport and is not inside a scrollable box
  let widest = null;
  const scrollable = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > window.innerWidth + 2 && !scrollable(el) && getComputedStyle(el).position !== 'fixed') {
      if (!widest || r.right > widest.right) widest = { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), right: Math.round(r.right) };
    }
  }
  return {
    overflow: doc.scrollWidth - doc.clientWidth,
    mainWidth: rect ? Math.round(rect.width) : null,
    widest,
  };
});

export const narrowRecipes = [
  {
    name: 'الشاشات الضيقة: الصفحة لا تخرج عن عرض الموبايل',
    run: async (c) => {
      await c.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const problems = [];
      try {
        for (const route of ROUTES) {
          c.w.reset();
          await goto(c.page, c.base, route);
          try { await settle(c.page, c.w, 300); } catch (e) { problems.push(`${route}: ${e.message}`); continue; }
          const m = await measure(c.page);
          if (m.overflow > 2) problems.push(`${route}: the page scrolls sideways by ${m.overflow}px${m.widest ? ` (widest: <${m.widest.tag} class="${m.widest.cls}"> reaching ${m.widest.right}px)` : ''}`);
          else if (m.mainWidth !== null && m.mainWidth < 250) problems.push(`${route}: the content is squeezed to ${m.mainWidth}px`);
        }
        // the shortcuts panel is a drawer on a phone: closed at first, opened by its button
        await goto(c.page, c.base, '/');
        const shown = () => c.page.evaluate(() => { const a = document.querySelector('aside'); return !!a && getComputedStyle(a).display !== 'none'; });
        if (await shown()) problems.push('/: the shortcuts panel is open by default on a phone');
        await c.page.evaluate(() => document.querySelector('button[title="اختصارات"]').click());
        await sleep(300);
        if (!await shown()) problems.push('/: the shortcuts button did not open the panel');
        await c.page.evaluate(() => [...document.querySelectorAll('aside a')].find(a => a.textContent.includes('إذن تسليم')).click());
        await sleep(800);
        if (!c.page.url().endsWith('/delivery-notes')) problems.push('a shortcut in the drawer did not open its screen');
        if (await shown()) problems.push('the drawer stayed open after choosing a shortcut');
      } finally {
        await c.page.setViewport({ width: 1500, height: 1000 });
      }
      // on a wide screen the panel is always there and the button is hidden
      await goto(c.page, c.base, '/');
      const wide = await c.page.evaluate(() => {
        const a = document.querySelector('aside'); const b = document.querySelector('button[title="اختصارات"]');
        return { aside: !!a && getComputedStyle(a).display !== 'none', button: !!b && getComputedStyle(b).display !== 'none' };
      });
      if (!wide.aside) problems.push('wide screen: the shortcuts panel is hidden');
      if (wide.button) problems.push('wide screen: the shortcuts button is visible');
      if (problems.length) throw new Error(`${problems.length} screen(s) do not fit a phone:\n       ` + problems.join('\n       '));
    },
  },
];
void sleep;

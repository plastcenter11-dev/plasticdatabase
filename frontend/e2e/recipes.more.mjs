// Recipes for the flows the first batch skipped: collecting and bouncing checks,
// and a real login as a restricted user (menu and routes honour the permissions).

import { goto, clickText, sleep, settle } from './lib.mjs';

// click the button titled `title` in the table row that contains `text`
async function rowButton(page, text, title) {
  const ok = await page.evaluate((text, title) => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(text));
    const b = tr && [...tr.querySelectorAll('button')].find(x => x.title === title);
    if (b) b.click();
    return !!b;
  }, text, title);
  if (!ok) throw new Error(`no "${title}" button in the row containing "${text}"`);
  await sleep(400);
}

const makeCheck = (c, no, type, amount) => c.api('POST', '/finance/checks', {
  check_no: no, party_type: type, [type === 'customer' ? 'customer_id' : 'supplier_id']: (type === 'customer' ? c.customer : c.supplier).id,
  amount, due_date: '2027-03-01', date: c.today, status: 'pending',
});

const checkStatus = async (c, no) => (await c.api('GET', '/finance/checks')).find(x => x.check_no === no);

export const moreRecipes = [
  {
    name: 'تحصيل شيك',
    run: async (c) => {
      await makeCheck(c, 'E2E-CK-COL', 'customer', 150);
      await goto(c.page, c.base, '/checks');
      await rowButton(c.page, 'E2E-CK-COL', 'تحصيل');
      await settle(c.page, c.w);
      const ck = await checkStatus(c, 'E2E-CK-COL');
      if (ck.status !== 'collected') throw new Error(`status is ${ck.status}, expected collected`);
    },
  },
  {
    name: 'صرف شيك مورد',
    run: async (c) => {
      await makeCheck(c, 'E2E-CK-PAY', 'supplier', 90);
      await goto(c.page, c.base, '/supplier-checks');
      await rowButton(c.page, 'E2E-CK-PAY', 'تم الصرف');
      await settle(c.page, c.w);
      const ck = await checkStatus(c, 'E2E-CK-PAY');
      if (ck.status !== 'collected') throw new Error(`status is ${ck.status}, expected collected`);
    },
  },
  {
    name: 'ارتداد شيك',
    run: async (c) => {
      await makeCheck(c, 'E2E-CK-BNC', 'customer', 120);
      await goto(c.page, c.base, '/checks');
      await rowButton(c.page, 'E2E-CK-BNC', 'مرتجع');
      await clickText(c.page, 'تأكيد الارتداد');
      await sleep(1500); // the app reports the bounce with an error-styled toast, so settle() would misread it
      const ck = await checkStatus(c, 'E2E-CK-BNC');
      if (ck.status !== 'bounced') throw new Error(`status is ${ck.status}, expected bounced`);
      if (!ck.bounced_date) throw new Error('bounced check has no bounced_date');
    },
  },
  {
    name: 'مستخدم بصلاحيات محدودة',
    run: async (c) => {
      const username = 'e2e_limited';
      const users = await c.api('GET', '/users');
      if (!users.some(u => u.username === username)) {
        await c.api('POST', '/users', { username, password: 'e2e-pass-1', role: 'user', permissions: { cash_receipts: ['view'] } });
      }
      const context = await c.browser.createBrowserContext();
      const page = await context.newPage();
      page.on('dialog', d => d.accept());
      try {
        await page.goto(c.base + '/login', { waitUntil: 'networkidle0' });
        await page.type('input[placeholder="admin"]', username);
        await page.type('input[type="password"]', 'e2e-pass-1');
        await clickText(page, 'تسجيل الدخول');
        await sleep(1500);
        if (page.url().includes('/login')) throw new Error('login did not leave the login page');
        const menu = await page.evaluate(() => (document.querySelector('nav') || document.body).innerText);
        if (menu.includes('المستخدمين')) throw new Error('restricted user sees the users menu');
        await page.goto(c.base + '/users', { waitUntil: 'networkidle0' });
        await sleep(800);
        const body = await page.evaluate(() => document.body.innerText);
        if (body.includes('اسم المستخدم *') || /e2e_limited.*admin/s.test(body) && body.includes('إضافة مستخدم')) throw new Error('restricted user can use the users page');
        // the API itself refuses
        const token = await page.evaluate(() => localStorage.getItem('token'));
        const res = await fetch(c.apiUrl + '/api/users', { headers: { Authorization: 'Bearer ' + token } });
        if (res.status !== 403) throw new Error(`GET /users answered ${res.status}, expected 403`);
        const inv = await fetch(c.apiUrl + '/api/sales-invoices', { headers: { Authorization: 'Bearer ' + token } });
        if (inv.status !== 403) throw new Error(`GET /sales-invoices answered ${inv.status}, expected 403`);
      } finally {
        await context.close();
      }
    },
  },
];

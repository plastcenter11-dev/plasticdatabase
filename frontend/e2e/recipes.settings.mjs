// Settings screens, customer credit limits and the change-password flow.

import { goto, clickText, field, settle, sleep } from './lib.mjs';

// the submit button is labelled exactly "تغيير" (the tab is "تغيير كلمة المرور")
const submitChange = (page) => page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'تغيير').click());

const login = async (c, username, password) => {
  const res = await fetch(c.apiUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.status;
};

// the add / edit-in-place list used for both categories and item types
async function lookupFlow(c, placeholder, apiUrl, label) {
  const name = `E2E ${label} ${String(Date.now()).slice(-5)}`;
  const renamed = name + ' معدل';
  await goto(c.page, c.base, '/settings/options');
  await clickText(c.page, 'الأقسام والأنواع');
  await sleep(500);
  const input = await c.page.$(`input[placeholder="${placeholder}"]`);
  await input.type(name, { delay: 10 });
  await c.page.keyboard.press('Enter');
  await sleep(900);
  if (!(await c.api('GET', apiUrl)).some(x => x.name === name)) throw new Error(`the ${label} was not added`);

  const rowButton = (text, index) => c.page.evaluate((text, index) => {
    const row = [...document.querySelectorAll('div')].find(d => d.className.includes('bg-gray-50') && d.textContent.includes(text) && d.querySelector('button'));
    if (!row) return false;
    row.querySelectorAll('button')[index].click();
    return true;
  }, text, index);

  if (!await rowButton(name, 0)) throw new Error(`no edit button on the ${label} row`);
  await sleep(300);
  await c.page.keyboard.down('Control'); await c.page.keyboard.press('KeyA'); await c.page.keyboard.up('Control');
  await c.page.keyboard.type(renamed, { delay: 10 });
  await c.page.keyboard.press('Enter');
  await sleep(900);
  if (!(await c.api('GET', apiUrl)).some(x => x.name === renamed)) throw new Error(`the ${label} was not renamed`);

  if (!await rowButton(renamed, 1)) throw new Error(`no delete button on the ${label} row`);
  await sleep(1000);
  if ((await c.api('GET', apiUrl)).some(x => x.name === renamed)) throw new Error(`the ${label} was not deleted`);
}

export const settingsRecipes = [
  {
    name: 'الإعدادات: بيانات المنشأة تُحفظ',
    run: async (c) => {
      const before = await c.api('GET', '/settings');
      const name = 'E2E منشأة ' + String(Date.now()).slice(-5);
      try {
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'بيانات المنشأة').catch(() => {});
        await field(c.page, 'اسم المنشأة', name);
        await field(c.page, 'الهاتف', '0123456789');
        await clickText(c.page, 'حفظ');
        await settle(c.page, c.w, 1000);
        const now = await c.api('GET', '/settings');
        if (now.company_name !== name || now.company_phone !== '0123456789') throw new Error('the company data was not saved: ' + JSON.stringify(now));
        // survives a reload
        await goto(c.page, c.base, '/settings/options');
        await clickText(c.page, 'بيانات المنشأة').catch(() => {});
        const shown = await c.page.$eval('input.erp-input', e => e.value);
        if (shown !== name) throw new Error('after a reload the screen shows "' + shown + '" instead of the saved name');
      } finally {
        await c.api('PUT', '/settings', before);
      }
    },
  },
  { name: 'الإعدادات: الأقسام إضافة وتعديل وحذف', run: (c) => lookupFlow(c, 'اسم القسم الجديد', '/categories', 'قسم') },
  { name: 'الإعدادات: الأنواع إضافة وتعديل وحذف', run: (c) => lookupFlow(c, 'اسم النوع الجديد', '/item-types', 'نوع') },
  {
    name: 'حد ائتمان العميل يُحفظ',
    run: async (c) => {
      const cust = await c.api('POST', '/customers', { name: 'E2E زبون ائتمان' });
      await goto(c.page, c.base, '/customer-credit-limits');
      await c.page.type('input[placeholder="بحث باسم العميل..."]', 'E2E زبون ائتمان', { delay: 10 });
      await sleep(500);
      await c.page.evaluate(() => {
        const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E2E زبون ائتمان'));
        tr.querySelector('button.erp-btn-outline').click();
      });
      await sleep(300);
      const box = await c.page.$('tbody input[type="number"]');
      await box.evaluate((e) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '5000'); e.dispatchEvent(new Event('input', { bubbles: true })); });
      await c.page.evaluate(() => [...document.querySelectorAll('tbody button')].find(b => b.textContent.includes('حفظ')).click());
      await settle(c.page, c.w, 1000);
      const saved = (await c.api('GET', '/customers')).find(x => x.id === cust.id);
      if (Number(saved.credit_limit) !== 5000) throw new Error(`credit limit is ${saved.credit_limit}, expected 5000`);
      const text = await c.page.evaluate(() => document.querySelector('tbody').innerText);
      if (!text.includes('5,000') && !text.includes('5000')) throw new Error('the screen does not show the new limit');
    },
  },
  {
    name: 'تغيير كلمة المرور من الشاشة',
    run: async (c) => {
      const username = 'e2e_pw';
      if (!(await c.api('GET', '/users')).some(u => u.username === username)) {
        await c.api('POST', '/users', { username, password: 'old-pass-1', role: 'user', permissions: {} });
      }
      const context = await c.browser.createBrowserContext();
      const page = await context.newPage();
      try {
        await page.goto(c.base + '/login', { waitUntil: 'networkidle0' });
        await page.type('input[placeholder="admin"]', username);
        await page.type('input[type="password"]', 'old-pass-1');
        await clickText(page, 'تسجيل الدخول');
        await sleep(1500);
        await goto(page, c.base, '/settings/change-password');
        await field(page, 'كلمة المرور الحالية', 'old-pass-1');
        await field(page, 'كلمة المرور الجديدة', 'new-pass-2');
        await field(page, 'تأكيد كلمة المرور', 'new-pass-2');
        await submitChange(page);
        await sleep(1200);
        if (await login(c, username, 'old-pass-1') === 200) throw new Error('the old password still works');
        if (await login(c, username, 'new-pass-2') !== 200) throw new Error('the new password does not work');
        // a wrong current password is refused
        await goto(page, c.base, '/settings/change-password');
        await field(page, 'كلمة المرور الحالية', 'wrong-pass');
        await field(page, 'كلمة المرور الجديدة', 'third-pass-3');
        await field(page, 'تأكيد كلمة المرور', 'third-pass-3');
        await submitChange(page);
        await sleep(1200);
        if (await login(c, username, 'third-pass-3') === 200) throw new Error('a wrong current password still changed the password');
        if (await login(c, username, 'new-pass-2') !== 200) throw new Error('the password changed although the current one was wrong');
      } finally {
        await context.close();
      }
    },
  },
];

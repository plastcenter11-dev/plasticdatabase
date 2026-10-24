// One recipe per screen: open it, fill the form like a person would, save, then
// confirm through the API that the record really exists. A recipe fails on an
// error toast, a failed request, a page error, or a missing record.

import { goto, clickText, field, save } from './lib.mjs';
import { transactionRecipes } from './recipes.transactions.mjs';
import { pageRecipes } from './recipes.pages.mjs';
import { moreRecipes } from './recipes.more.mjs';
import { editDeleteRecipes } from './recipes.editdelete.mjs';
import { stockCountRecipes } from './recipes.stockcount.mjs';

async function expectApi(c, url, predicate, what) {
  // the app may still be saving when the click returns: look again for a few seconds
  for (let i = 0; ; i++) {
    const data = await c.api('GET', url);
    const list = Array.isArray(data) ? data : (data.rows || data);
    if (predicate(list)) return;
    if (i >= 12) throw new Error(`expected ${what} but ${url} has no such record`);
    await new Promise(r => setTimeout(r, 500));
  }
}

// add a record through a simple "add" button + one modal, then verify it
const simple = (name, path, button, fill, listUrl, predicate, what) => ({
  name,
  run: async (c) => {
    await goto(c.page, c.base, path);
    await clickText(c.page, button);
    await fill(c);
    await save(c.page, c.w);
    await expectApi(c, listUrl, predicate, what);
  },
});

export const recipes = [
  // ---- master data ----
  simple('مخزن جديد', '/warehouses', 'إضافة مخزن',
    async (c) => { await field(c.page, 'اسم المخزن', 'E2E مخزن جديد'); },
    '/warehouses', l => l.some(x => x.name === 'E2E مخزن جديد'), 'the new warehouse'),

  // the item form leaves category / type / width blank - the case that used to fail
  simple('صنف جديد (بدون قسم ونوع)', '/items', 'إضافة صنف',
    async (c) => { await field(c.page, 'اسم الصنف', 'E2E صنف جديد'); },
    '/items', l => l.some(x => x.name === 'E2E صنف جديد'), 'the new item'),

  simple('صنف غير مخزني جديد', '/items-non-stock', 'صنف جديد',
    async (c) => { await field(c.page, 'الاسم', 'E2E خدمة جديدة'); await field(c.page, 'سعر الشراء', 25); },
    '/items', l => l.some(x => x.name === 'E2E خدمة جديدة' && !x.is_stockable), 'the new non-stock item'),

  simple('عميل جديد', '/customers', 'إضافة عميل',
    async (c) => { await field(c.page, 'اسم العميل', 'E2E عميل جديد'); },
    '/customers', l => l.some(x => x.name === 'E2E عميل جديد'), 'the new customer'),

  simple('مورد جديد', '/suppliers', 'إضافة مورد',
    async (c) => { await field(c.page, 'اسم المورد', 'E2E شركة توريد'); },
    '/suppliers', l => l.some(x => x.name === 'E2E شركة توريد'), 'the new supplier'),

  simple('موظف جديد', '/employees', 'إضافة موظف',
    async (c) => { await field(c.page, 'الاسم', 'E2E موظف جديد'); await field(c.page, 'نسبة العمولة', 2); },
    '/employees', l => l.some(x => x.name === 'E2E موظف جديد' && Number(x.commission_rate) === 2), 'the new employee'),

  // ---- money ----
  simple('تحصيل نقدي', '/cash-receipts', 'تحصيل جديد',
    async (c) => { await field(c.page, 'العميل', 'E2E عميل'); await field(c.page, 'المبلغ', 500); },
    '/finance/cash-receipts', l => l.some(x => Number(x.amount) === 500), 'a receipt of 500'),

  simple('دفع نقدي', '/cash-payments', 'دفع جديد',
    async (c) => { await field(c.page, 'المورد', 'E2E مورد'); await field(c.page, 'المبلغ', 300); },
    '/finance/cash-payments', l => l.some(x => Number(x.amount) === 300), 'a payment of 300'),

  {
    name: 'شيك تحصيل',
    run: async (c) => {
      await goto(c.page, c.base, '/checks');
      await clickText(c.page, 'شيك جديد');
      await field(c.page, 'رقم الشيك', 'E2E-CK-1');
      await field(c.page, 'العميل', 'E2E عميل');
      await field(c.page, 'المبلغ', 700);
      await field(c.page, 'تاريخ الاستحقاق', '2027-01-15');
      await save(c.page, c.w);
      await expectApi(c, '/finance/checks', l => l.some(x => x.check_no === 'E2E-CK-1' && x.party_type === 'customer'), 'the customer check');
    },
  },

  {
    name: 'شيك دفع',
    run: async (c) => {
      await goto(c.page, c.base, '/supplier-checks');
      await clickText(c.page, 'شيك جديد');
      await field(c.page, 'رقم الشيك', 'E2E-CK-2');
      await field(c.page, 'المورد', 'E2E مورد');
      await field(c.page, 'المبلغ', 400);
      await field(c.page, 'تاريخ الاستحقاق', '2027-02-15');
      await save(c.page, c.w);
      await expectApi(c, '/finance/checks', l => l.some(x => x.check_no === 'E2E-CK-2' && x.party_type === 'supplier'), 'the supplier check');
    },
  },

  simple('مصروف', '/expenses', 'مصروف جديد',
    async (c) => { await field(c.page, 'الوصف', 'E2E مصروف'); await field(c.page, 'المبلغ', 50); },
    '/finance/expenses', l => l.some(x => x.description === 'E2E مصروف'), 'the expense'),

  simple('إيراد آخر', '/other-income', 'إيراد جديد',
    async (c) => { await field(c.page, 'الوصف', 'E2E إيراد'); await field(c.page, 'المبلغ', 80); },
    '/finance/other-income', l => l.some(x => x.description === 'E2E إيراد'), 'the other income'),

  ...transactionRecipes,
  ...moreRecipes,
  ...editDeleteRecipes,
  ...stockCountRecipes,
  ...pageRecipes,
];

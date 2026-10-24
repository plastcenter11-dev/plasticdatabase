// Edit and delete through the real screens, including the stock reversal when a
// posted invoice or an assembly is deleted.

import { goto, field, save, settle, sleep } from './lib.mjs';

const stockOf = async (c, itemId) => (await c.api('GET', '/stock/items-stock')).find(r => r.item_id === itemId);
const weightOf = async (c, itemId) => Number((await stockOf(c, itemId) || {}).total_weight || 0);

// click the edit (outline) or delete (danger) button of the row containing `text`
async function rowAction(page, text, kind) {
  const cls = kind === 'edit' ? 'erp-btn-outline' : 'erp-btn-danger';
  const ok = await page.evaluate((text, cls) => {
    const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes(text));
    const b = tr && [...tr.querySelectorAll('button')].find(x => x.classList.contains(cls));
    if (b) b.click();
    return !!b;
  }, text, cls);
  if (!ok) throw new Error(`no ${kind} button in the row containing "${text}"`);
  await sleep(400);
}

const search = async (page, text) => {
  const box = await page.$('input[placeholder*="بحث"]');
  if (!box) return;
  await box.evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await sleep(700);
};

const draftInvoice = (c, no, extra = {}) => c.api('POST', '/sales-invoices', {
  customer_id: c.customer.id, warehouse_id: c.w1.id, invoice_no: no, date: c.today,
  subtotal: 100, total: 100, paid: 0, remaining: 100,
  items: [{ item_id: c.items.a.id, quantity: 5, weight: 50, price: 2, discount: 0, total: 100 }], ...extra,
});

export const editDeleteRecipes = [
  {
    name: 'تعديل وحذف صنف',
    run: async (c) => {
      const item = await c.api('POST', '/items', { code: 'E2E-ED-' + Date.now(), name: 'E2E صنف للتعديل', unit: 'كيلو', purchase_price: 5, is_stockable: true });
      await goto(c.page, c.base, '/items');
      await search(c.page, 'E2E صنف للتعديل');
      await rowAction(c.page, 'E2E صنف للتعديل', 'edit');
      await field(c.page, 'اسم الصنف', 'E2E صنف معدل');
      await save(c.page, c.w);
      if ((await c.api('GET', '/items')).find(i => i.id === item.id).name !== 'E2E صنف معدل') throw new Error('the item was not renamed');
      await search(c.page, 'E2E صنف معدل');
      await rowAction(c.page, 'E2E صنف معدل', 'delete');
      await settle(c.page, c.w, 1200);
      if ((await c.api('GET', '/items')).some(i => i.id === item.id)) throw new Error('the item was not deleted');
    },
  },
  {
    name: 'تعديل وحذف عميل',
    run: async (c) => {
      const cust = await c.api('POST', '/customers', { name: 'E2E عميل للحذف' });
      await goto(c.page, c.base, '/customers');
      await search(c.page, 'E2E عميل للحذف');
      await rowAction(c.page, 'E2E عميل للحذف', 'edit');
      await field(c.page, 'الهاتف', '0100000');
      await save(c.page, c.w);
      if ((await c.api('GET', '/customers')).find(x => x.id === cust.id).phone !== '0100000') throw new Error('the phone was not saved');
      await search(c.page, 'E2E عميل للحذف');
      await rowAction(c.page, 'E2E عميل للحذف', 'delete');
      await settle(c.page, c.w, 1200);
      if ((await c.api('GET', '/customers')).some(x => x.id === cust.id)) throw new Error('the customer was not deleted');
    },
  },
  {
    name: 'تعديل وحذف فاتورة بيع مسودة',
    run: async (c) => {
      const no = 'E2E-DR-' + Date.now();
      const inv = await draftInvoice(c, no);
      await goto(c.page, c.base, '/sales-invoices');
      await search(c.page, no);
      await rowAction(c.page, no, 'edit');
      await field(c.page, 'المدفوع', 30);
      await save(c.page, c.w);
      const saved = (await c.api('GET', '/sales-invoices')).find(i => i.id === inv.id);
      if (Number(saved.paid) !== 30) throw new Error(`paid is ${saved.paid}, expected 30`);
      await search(c.page, no);
      await rowAction(c.page, no, 'delete');
      await settle(c.page, c.w, 1200);
      if ((await c.api('GET', '/sales-invoices')).some(i => i.id === inv.id)) throw new Error('the draft invoice was not deleted');
    },
  },
  {
    // a posted invoice has moved stock and accounts, so the app refuses to delete it
    name: 'فاتورة بيع مرحلة لا تُحذف',
    run: async (c) => {
      const no = 'E2E-PD-' + Date.now();
      const inv = await draftInvoice(c, no);
      await c.api('POST', `/sales-invoices/${inv.id}/post`);
      const before = await weightOf(c, c.items.a.id);
      await goto(c.page, c.base, '/sales-invoices');
      await search(c.page, no);
      await rowAction(c.page, no, 'delete');
      await sleep(1200);
      const toast = await c.page.evaluate(() => [...document.querySelectorAll('.Toastify__toast--error')].map(t => t.textContent.trim()).join('|'));
      if (!toast.includes('مرحّلة')) throw new Error('expected a refusal toast, got: "' + toast + '"');
      if (!(await c.api('GET', '/sales-invoices')).some(i => i.id === inv.id)) throw new Error('the posted invoice was deleted');
      if (await weightOf(c, c.items.a.id) !== before) throw new Error('stock changed although the delete was refused');
    },
  },
  {
    name: 'حذف تركيب صنف يعيد المخزون',
    run: async (c) => {
      const made = await c.api('POST', '/items', { code: 'E2E-AS-' + Date.now(), name: 'E2E مركب للحذف', unit: 'كيلو', purchase_price: 0, is_stockable: true });
      const before = { a: await weightOf(c, c.items.a.id), c: 0 };
      const created = await c.api('POST', '/stock/assemblies', {
        date: c.today, assembled_item_id: made.id, assembled_qty: 1, assembled_weight: 20,
        warehouse_id: c.w1.id, output_warehouse_id: c.w1.id,
        components: [{ item_id: c.items.a.id, quantity: 2, weight: 20, warehouse_id: c.w1.id }],
      });
      if (before.a - await weightOf(c, c.items.a.id) !== 20) throw new Error('the assembly did not consume 20 kg of the component');
      if (await weightOf(c, made.id) !== 20) throw new Error('the assembly did not add 20 kg of the assembled item');
      await goto(c.page, c.base, '/item-assembly');
      await rowAction(c.page, 'E2E مركب للحذف', 'delete');
      await settle(c.page, c.w, 1500);
      const list = await c.api('GET', '/stock/assemblies');
      if ((Array.isArray(list) ? list : list.rows).some(x => x.id === created.id)) throw new Error('the assembly was not deleted');
      const after = { a: await weightOf(c, c.items.a.id), c: await weightOf(c, made.id) };
      if (after.a !== before.a || after.c !== before.c) throw new Error(`stock not restored: component ${after.a} (was ${before.a}), assembled ${after.c} (was ${before.c})`);
    },
  },
];

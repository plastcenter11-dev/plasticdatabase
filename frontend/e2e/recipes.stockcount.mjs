// Stock count ("تعديل جرد"): it sets the balance to the counted figures instead of
// adding to it, and a count cannot be edited or deleted afterwards.

import { goto, clickText, field, save, settle, sleep } from './lib.mjs';

const balance = async (c, itemId, warehouseId) => {
  const row = (await c.api('GET', '/stock/items-stock')).find(r => r.item_id === itemId);
  const here = row && row.warehouses.find(w => w.warehouse_id === warehouseId);
  return here ? { weight: Number(here.weight), quantity: Number(here.quantity) } : { weight: 0, quantity: 0 };
};

async function count(c, itemName, warehouse, weight, quantity) {
  await goto(c.page, c.base, '/stock-adjustments');
  await clickText(c.page, 'حركة جديدة');
  await field(c.page, 'نوع الحركة', 'تعديل جرد');
  await field(c.page, 'المخزن', warehouse); await field(c.page, 'الصنف', itemName);
  await field(c.page, 'الوزن', weight); await field(c.page, 'العدد', quantity);
  await save(c.page, c.w);
}

export const stockCountRecipes = [
  {
    name: 'تعديل جرد يضبط الرصيد على الكمية المعدودة',
    run: async (c) => {
      const code = 'E2E-JD-' + Date.now();
      const item = await c.api('POST', '/items', { code, name: 'E2E صنف جرد', unit: 'كيلو', purchase_price: 4, is_stockable: true });
      await c.api('POST', '/stock/adjustments', { item_id: item.id, warehouse_id: c.w2.id, movement_type: 'إضافة', date: c.today, quantity: 10, weight: 100, description: 'E2E' });
      await count(c, 'E2E صنف جرد', 'E2E مخزن 2', 80, 8);
      let b = await balance(c, item.id, c.w2.id);
      if (b.weight !== 80 || b.quantity !== 8) throw new Error(`after counting 80 kg / 8 the balance is ${b.weight} / ${b.quantity}`);
      // counting a higher figure sets it too (it is not an addition)
      await count(c, 'E2E صنف جرد', 'E2E مخزن 2', 150, 15);
      b = await balance(c, item.id, c.w2.id);
      if (b.weight !== 150 || b.quantity !== 15) throw new Error(`after counting 150 kg / 15 the balance is ${b.weight} / ${b.quantity}`);
      // the count of another warehouse is not touched
      const other = await balance(c, item.id, c.w1.id);
      if (other.weight !== 0) throw new Error('the count changed another warehouse');
    },
  },
  {
    name: 'حركة الجرد لا تعدّل ولا تحذف',
    run: async (c) => {
      const item = await c.api('POST', '/items', { code: 'E2E-JL-' + Date.now(), name: 'E2E صنف جرد مقفل', unit: 'كيلو', purchase_price: 4, is_stockable: true });
      const m = await c.api('POST', '/stock/adjustments', { item_id: item.id, warehouse_id: c.w2.id, movement_type: 'تعديل جرد', date: c.today, quantity: 5, weight: 50, description: 'E2E' });
      for (const [method, body] of [['PUT', { item_id: item.id, warehouse_id: c.w2.id, movement_type: 'تعديل جرد', date: c.today, quantity: 6, weight: 60 }], ['DELETE']]) {
        let refused = false;
        try { await c.api(method, `/stock/adjustments/${m.id}`, body); } catch (e) { refused = /-> 400/.test(e.message); }
        if (!refused) throw new Error(`${method} on a count was not refused with 400`);
      }
      const b = await balance(c, item.id, c.w2.id);
      if (b.weight !== 50) throw new Error(`balance changed to ${b.weight} although the edit and delete were refused`);
    },
  },
  {
    name: 'تعديل وحذف حركة إضافة يغيّر الرصيد',
    run: async (c) => {
      const item = await c.api('POST', '/items', { code: 'E2E-JA-' + Date.now(), name: 'E2E صنف حركة', unit: 'كيلو', purchase_price: 4, is_stockable: true });
      await c.api('POST', '/stock/adjustments', { item_id: item.id, warehouse_id: c.w2.id, movement_type: 'إضافة', date: c.today, quantity: 4, weight: 40, description: 'E2E حركة للتعديل' });
      await goto(c.page, c.base, '/stock-adjustments');
      const click = async (cls) => {
        const ok = await c.page.evaluate((cls) => {
          const tr = [...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E2E صنف حركة'));
          const b = tr && [...tr.querySelectorAll('button')].find(x => x.classList.contains(cls));
          if (b) b.click();
          return !!b;
        }, cls);
        if (!ok) throw new Error(`no ${cls} button for the movement`);
        await sleep(500);
      };
      await click('erp-btn-outline');
      await field(c.page, 'الوزن', 70);
      await save(c.page, c.w);
      let b = await balance(c, item.id, c.w2.id);
      if (b.weight !== 70) throw new Error(`after editing 40 to 70 kg the balance is ${b.weight}`);
      await click('erp-btn-danger');
      await settle(c.page, c.w, 1200);
      b = await balance(c, item.id, c.w2.id);
      if (b.weight !== 0) throw new Error(`after deleting the movement the balance is ${b.weight}, expected 0`);
    },
  },
];

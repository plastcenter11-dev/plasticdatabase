// Recipes for the screens that move stock and money: stock entries, transfers,
// assemblies, sales / purchase invoices (posting them), returns, delivery notes,
// opening balances. Order matters a little: later recipes use what earlier ones
// posted (e.g. the purchase return needs a posted purchase invoice).

import { goto, clickText, field, cell, save, settle, sleep } from './lib.mjs';

async function expectApi(c, url, predicate, what) {
  const data = await c.api('GET', url);
  const list = Array.isArray(data) ? data : (data.rows || data);
  if (!predicate(list)) throw new Error(`expected ${what} but ${url} has no such record`);
}

const stockOf = async (c, itemId) => (await c.api('GET', '/stock/items-stock')).find(r => r.item_id === itemId);

export const transactionRecipes = [
  // ---- stock entries ----
  {
    name: 'إضافة للمخزن',
    run: async (c) => {
      await goto(c.page, c.base, '/stock-receive');
      await clickText(c.page, 'حركة جديدة');
      await field(c.page, 'المخزن', 'E2E مخزن 2'); await field(c.page, 'الصنف', 'E2E صنف أ');
      await field(c.page, 'الوزن', 100); await field(c.page, 'العدد', 10);
      await save(c.page, c.w);
      await expectApi(c, '/stock/adjustments', l => l.some(x => x.movement_type === 'إضافة' && Number(x.weight) === 100), 'the stock receipt');
    },
  },
  {
    name: 'صرف من المخزن',
    run: async (c) => {
      await goto(c.page, c.base, '/stock-issue');
      await clickText(c.page, 'حركة جديدة');
      await field(c.page, 'المخزن', 'E2E مخزن 1'); await field(c.page, 'الصنف', 'E2E-B -');
      await field(c.page, 'الوزن', 50); await field(c.page, 'العدد', 5);
      await save(c.page, c.w);
      await expectApi(c, '/stock/adjustments', l => l.some(x => x.movement_type === 'صرف' && Number(x.weight) === 50), 'the stock issue');
    },
  },
  {
    // an issue entered before the receipt: the balance may go negative
    name: 'صرف قبل الإضافة (رصيد سالب)',
    run: async (c) => {
      // an item with no stock at all in this warehouse, so the issue must push it below zero
      const fresh = await c.api('POST', '/items', { code: 'E2E-NEG-' + Date.now(), name: 'E2E بلا رصيد', unit: 'كيلو', purchase_price: 5, is_stockable: true });
      await goto(c.page, c.base, '/stock-issue');
      await clickText(c.page, 'حركة جديدة');
      await field(c.page, 'المخزن', 'E2E مخزن 2'); await field(c.page, 'الصنف', 'E2E بلا رصيد');
      await field(c.page, 'الوزن', 30); await field(c.page, 'العدد', 3);
      await save(c.page, c.w);
      const row = await stockOf(c, fresh.id);
      if (!row || Number(row.total_weight) !== -30 || Number(row.total_quantity) !== -3) throw new Error(`expected -30 kg / -3 after the issue, got ${row && row.total_weight} / ${row && row.total_quantity}`);
    },
  },
  {
    name: 'تحويل بين مخزنين وتأكيده',
    run: async (c) => {
      await goto(c.page, c.base, '/warehouse-transfers');
      await clickText(c.page, 'تحويل جديد');
      await field(c.page, 'من مخزن', 'E2E مخزن 1'); await field(c.page, 'إلى مخزن', 'E2E مخزن 2');
      await cell(c.page, 0, 0, 0, 'E2E صنف أ'); await cell(c.page, 0, 0, 2, 40); await cell(c.page, 0, 0, 3, 4);
      await save(c.page, c.w);
      await clickText(c.page, 'تأكيد');
      await settle(c.page, c.w);
      await expectApi(c, '/stock/transfers', l => l.some(x => x.status === 'confirmed'), 'a confirmed transfer');
    },
  },

  // ---- assembly ----
  {
    name: 'تركيب صنف مع مصاريف إضافية',
    run: async (c) => {
      await goto(c.page, c.base, '/item-assembly');
      await clickText(c.page, 'تركيب جديد');
      await field(c.page, 'الصنف المركّب', 'E2E-C -'); await field(c.page, 'الوزن', 100); await field(c.page, 'العدد', 10);
      await field(c.page, 'مخزن الإضافة', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 0, 'E2E-A -'); await cell(c.page, 0, 0, 1, 'E2E مخزن 1'); await cell(c.page, 0, 0, 2, 60); await cell(c.page, 0, 0, 3, 6);
      await clickText(c.page, '+ مصاريف إضافية');
      await cell(c.page, 0, 1, 1, 150); await cell(c.page, 0, 1, 3, 2);
      await save(c.page, c.w, 'تركيب');
      // components 60kg x 10 = 600, plus 2 x 150 = 300, over 100kg -> 9 per kg
      const out = (await c.api('GET', '/items')).find(i => i.id === c.items.c.id);
      if (Number(out.purchase_price) !== 9) throw new Error('assembled item cost should be 9, got ' + out.purchase_price);
    },
  },
  {
    name: 'تركيب بمكون أكبر من الرصيد (سالب)',
    run: async (c) => {
      const part = await c.api('POST', '/items', { code: 'E2E-PART-' + Date.now(), name: 'E2E مكون بلا رصيد', unit: 'كيلو', purchase_price: 4, is_stockable: true });
      await goto(c.page, c.base, '/item-assembly');
      await clickText(c.page, 'تركيب جديد');
      await field(c.page, 'الصنف المركّب', 'E2E-C -'); await field(c.page, 'الوزن', 10); await field(c.page, 'العدد', 1);
      await field(c.page, 'مخزن الإضافة', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 0, 'E2E مكون بلا رصيد'); await cell(c.page, 0, 0, 1, 'E2E مخزن 1'); await cell(c.page, 0, 0, 2, 500); await cell(c.page, 0, 0, 3, 50);
      await save(c.page, c.w, 'تركيب');
      const row = await stockOf(c, part.id);
      if (!row || Number(row.total_weight) !== -500 || Number(row.total_quantity) !== -50) throw new Error(`expected -500 kg / -50 for the component, got ${row && row.total_weight} / ${row && row.total_quantity}`);
    },
  },

  // ---- sales ----
  {
    name: 'فاتورة بيع بدفعة وترحيلها',
    run: async (c) => {
      await goto(c.page, c.base, '/sales-invoices');
      await clickText(c.page, 'فاتورة جديدة');
      await field(c.page, 'العميل', 'E2E عميل'); await field(c.page, 'المخزن', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 0, 'E2E صنف أ'); await cell(c.page, 0, 0, 1, 100); await cell(c.page, 0, 0, 2, 10); await cell(c.page, 0, 0, 3, 15);
      await field(c.page, 'المدفوع', 200);
      await save(c.page, c.w);
      c.w.reset();
      await clickText(c.page, 'ترحيل');
      await settle(c.page, c.w);
      await expectApi(c, '/sales-invoices', l => l.some(x => x.status === 'posted' && Number(x.paid) === 200), 'a posted invoice with a payment of 200');
      await expectApi(c, '/finance/cash-receipts', l => l.some(x => Number(x.amount) === 200), 'the receipt for the invoice payment');
    },
  },
  {
    // a line with a weight but no roll count must still leave the warehouse
    name: 'فاتورة بيع بوزن فقط بدون عدد',
    run: async (c) => {
      const before = await stockOf(c, c.items.b.id);
      await goto(c.page, c.base, '/sales-invoices');
      await clickText(c.page, 'فاتورة جديدة');
      await field(c.page, 'العميل', 'E2E عميل'); await field(c.page, 'المخزن', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 0, 'E2E-B -'); await cell(c.page, 0, 0, 1, 25); await cell(c.page, 0, 0, 2, 0); await cell(c.page, 0, 0, 3, 10);
      await save(c.page, c.w);
      c.w.reset();
      await clickText(c.page, 'ترحيل');
      await settle(c.page, c.w);
      const after = await stockOf(c, c.items.b.id);
      const dropped = Number(before.total_weight) - Number(after.total_weight);
      if (dropped !== 25) throw new Error(`stock should drop by 25 kg, dropped by ${dropped}`);
    },
  },
  {
    name: 'مرتجع بيع بدون فاتورة',
    run: async (c) => {
      await goto(c.page, c.base, '/sales-returns');
      await clickText(c.page, 'مرتجع جديد');
      await field(c.page, 'العميل', 'E2E عميل');
      await cell(c.page, 0, 0, 0, 'E2E صنف أ'); await cell(c.page, 0, 0, 1, 10); await cell(c.page, 0, 0, 2, 1); await cell(c.page, 0, 0, 3, 15);
      await save(c.page, c.w);
      await expectApi(c, '/returns/sales', l => l.length > 0, 'a sales return');
    },
  },

  // ---- purchases ----
  {
    name: 'فاتورة شراء بدفعة وترحيلها',
    run: async (c) => {
      await goto(c.page, c.base, '/purchase-invoices');
      await clickText(c.page, 'فاتورة جديدة');
      await field(c.page, 'المورد', 'E2E مورد'); await field(c.page, 'المخزن', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 0, 'E2E صنف أ'); await cell(c.page, 0, 0, 1, 200); await cell(c.page, 0, 0, 2, 20); await cell(c.page, 0, 0, 3, 12);
      await field(c.page, 'المدفوع', 500);
      await save(c.page, c.w);
      c.w.reset();
      await clickText(c.page, 'ترحيل');
      await settle(c.page, c.w);
      await expectApi(c, '/purchase-invoices', l => l.some(x => x.status === 'posted' && Number(x.paid) === 500), 'a posted purchase invoice with a payment of 500');
      await expectApi(c, '/finance/cash-payments', l => l.some(x => Number(x.amount) === 500), 'the payment for the invoice');
    },
  },
  {
    name: 'مرتجع شراء على فاتورة',
    run: async (c) => {
      const inv = (await c.api('GET', '/purchase-invoices')).find(x => x.status === 'posted');
      if (!inv) throw new Error('needs a posted purchase invoice (the purchase recipe runs first)');
      await goto(c.page, c.base, '/purchase-returns');
      await clickText(c.page, 'مرتجع جديد');
      await field(c.page, 'المورد', 'E2E مورد');
      await field(c.page, 'فاتورة الشراء', inv.invoice_no);
      await sleep(500);
      await cell(c.page, 0, 0, 3, 20); await cell(c.page, 0, 0, 4, 2);
      await save(c.page, c.w, 'حفظ المرتجع');
      await expectApi(c, '/returns/purchase', l => l.length > 0, 'a purchase return');
    },
  },

  // ---- delivery note: create it, then post it as an invoice with a cash payment ----
  {
    name: 'إذن تسليم وترحيله بدفعة نقدية',
    run: async (c) => {
      await goto(c.page, c.base, '/delivery-notes');
      await clickText(c.page, 'إذن تسليم جديد');
      await field(c.page, 'العميل', 'E2E عميل');
      await field(c.page, 'الصنف', 'E2E صنف أ'); await field(c.page, 'الوزن الصافي', 80); await field(c.page, 'عدد البكر', 8);
      await save(c.page, c.w, 'حفظ إذن التسليم');
      await clickText(c.page, 'ترحيل');
      await sleep(600);
      await field(c.page, 'رقم الفاتورة', 'E2E-DN-1'); await field(c.page, 'المخزن', 'E2E مخزن 1');
      await cell(c.page, 0, 0, 3, 40);
      await field(c.page, 'دفعة نقدية', true);
      await field(c.page, 'القيمة', 1000, 0);
      await field(c.page, 'شيك', true);
      await field(c.page, 'رقم الشيك', 'E2E-DN-CK');
      await field(c.page, 'القيمة', 600, 1);
      await field(c.page, 'تاريخ الاستحقاق', '2027-03-01');
      await save(c.page, c.w, 'ترحيل');
      await expectApi(c, '/delivery-notes', l => l.some(x => x.status === 'delivered'), 'a delivered note');
      await expectApi(c, '/finance/cash-receipts', l => l.some(x => Number(x.amount) === 1000), 'the cash receipt taken at posting');
      await expectApi(c, '/finance/checks', l => l.some(x => x.check_no === 'E2E-DN-CK' && Number(x.amount) === 600), 'the check taken at posting');
    },
  },

  // ---- opening balance ----
  {
    name: 'رصيد افتتاحي لعميل',
    run: async (c) => {
      await goto(c.page, c.base, '/opening-balances');
      await clickText(c.page, 'رصيد جديد');
      await field(c.page, 'العميل', 'E2E عميل'); await field(c.page, 'مدين', 1200);
      await save(c.page, c.w);
      await expectApi(c, '/opening-balances', l => l.some(x => Number(x.debit) === 1200), 'the opening balance');
    },
  },
];

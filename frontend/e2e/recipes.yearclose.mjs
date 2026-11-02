// Closing a financial year with real documents in two years: balances and account
// statements must stay right across the close, the closed year must refuse changes,
// and reopening it must let a correction through.

const refusedWith = async (fn, pattern) => {
  try { await fn(); } catch (e) { return pattern.test(e.message) ? true : `refused with another message: ${e.message}`; }
  return 'was accepted';
};

export const yearCloseRecipes = [
  {
    name: 'إقفال السنة بمستندات في سنتين: الأرصدة وكشوف الحساب',
    run: async (c) => {
      const years = () => c.api('GET', '/financial-years');
      const originalActive = (await years()).find(y => y.is_active);
      const customerOf = async (id) => (await c.api('GET', '/customers')).find(x => x.id === id);
      const supplierOf = async (id) => (await c.api('GET', '/suppliers')).find(x => x.id === id);
      const statement = async (id, from) => c.api('GET', `/customers/${id}/statement${from ? `?from=${from}` : ''}`);

      const customer = await c.api('POST', '/customers', { name: 'E2E زبون سنتين' });
      const supplier = await c.api('POST', '/suppliers', { name: 'E2E تاجر سنتين' });
      const y1 = await c.api('POST', '/financial-years', { name: 'E2E سنة 2003', start_date: '2003-01-01', end_date: '2003-12-31' });
      const y2 = await c.api('POST', '/financial-years', { name: 'E2E سنة 2004', start_date: '2004-01-01', end_date: '2004-12-31' });

      const cleanup = async () => {
        for (const y of (await years()).filter(y => y.name.startsWith('E2E سنة'))) if (y.is_closed) await c.api('POST', `/financial-years/${y.id}/reopen`);
        if (originalActive) await c.api('POST', `/financial-years/${originalActive.id}/activate`);
        for (const y of (await years()).filter(y => y.name.startsWith('E2E سنة'))) {
          if (y.is_active) await c.api('PUT', `/financial-years/${y.id}`, { is_active: false });
          await c.api('DELETE', `/financial-years/${y.id}`);
        }
      };

      try {
        await c.api('POST', `/financial-years/${y1.id}/activate`);

        // ---- year 1: a sale with 400 paid, a 100 receipt, a purchase with 300 paid, a 100 payment
        const saleItems = (total) => [{ item_id: c.items.a.id, quantity: 1, weight: 10, price: total / 10, discount: 0, total }];
        const sale1 = await c.api('POST', '/sales-invoices', {
          customer_id: customer.id, warehouse_id: c.w1.id, invoice_no: 'E2E-Y1-S-' + Date.now(), date: '2003-06-10',
          subtotal: 1000, total: 1000, paid: 400, remaining: 600, items: saleItems(1000),
        });
        await c.api('POST', `/sales-invoices/${sale1.id}/post`);
        await c.api('POST', '/finance/cash-receipts', { customer_id: customer.id, amount: 100, date: '2003-07-01', payment_method: 'نقدي' });
        const buy1 = await c.api('POST', '/purchase-invoices', {
          supplier_id: supplier.id, warehouse_id: c.w1.id, invoice_no: 'E2E-Y1-P-' + Date.now(), date: '2003-06-15',
          subtotal: 800, total: 800, paid: 300, remaining: 500, items: saleItems(800),
        });
        await c.api('POST', `/purchase-invoices/${buy1.id}/post`);
        await c.api('POST', '/finance/cash-payments', { supplier_id: supplier.id, amount: 100, date: '2003-07-05', payment_method: 'نقدي' });

        const before = { customer: Number((await customerOf(customer.id)).balance), supplier: Number((await supplierOf(supplier.id)).balance) };
        if (before.customer !== 500) throw new Error(`customer balance before the close is ${before.customer}, expected 1000 - 400 - 100 = 500`);
        if (Math.abs(before.supplier) !== 400) throw new Error(`supplier balance before the close is ${before.supplier}, expected 800 - 300 - 100 = 400`);
        const stmtBefore = await statement(customer.id);
        const lastBefore = stmtBefore[stmtBefore.length - 1].balance;

        // ---- close year 1 into year 2
        await c.api('POST', `/financial-years/${y1.id}/close`, { next_year_id: y2.id });
        const now = await years();
        if (!now.find(y => y.id === y1.id).is_closed || !now.find(y => y.id === y2.id).is_active) throw new Error('the close did not close 2003 and activate 2004');
        const afterClose = { customer: Number((await customerOf(customer.id)).balance), supplier: Number((await supplierOf(supplier.id)).balance) };
        if (afterClose.customer !== before.customer || afterClose.supplier !== before.supplier) throw new Error(`the close changed the balances: ${JSON.stringify(before)} -> ${JSON.stringify(afterClose)}`);
        const stmtAfter = await statement(customer.id);
        if (stmtAfter[stmtAfter.length - 1].balance !== lastBefore) throw new Error('the statement balance changed with the close');

        // ---- year 2 documents
        const sale2 = await c.api('POST', '/sales-invoices', {
          customer_id: customer.id, warehouse_id: c.w1.id, invoice_no: 'E2E-Y2-S-' + Date.now(), date: '2004-02-01',
          subtotal: 200, total: 200, paid: 0, remaining: 200, items: saleItems(200),
        });
        await c.api('POST', `/sales-invoices/${sale2.id}/post`);
        const buy2 = await c.api('POST', '/purchase-invoices', {
          supplier_id: supplier.id, warehouse_id: c.w1.id, invoice_no: 'E2E-Y2-P-' + Date.now(), date: '2004-02-05',
          subtotal: 100, total: 100, paid: 0, remaining: 100, items: saleItems(100),
        });
        await c.api('POST', `/purchase-invoices/${buy2.id}/post`);
        if (Number((await customerOf(customer.id)).balance) !== 700) throw new Error('the customer balance after a 200 sale in the new year should be 700');
        if (Math.abs(Number((await supplierOf(supplier.id)).balance)) !== 500) throw new Error('the supplier balance after a 100 purchase in the new year should be 500');

        // the statement of the new year starts from the carried-forward balance of the old one
        const s2 = await statement(customer.id, '2004-01-01');
        if (!s2[0].isOpening || s2[0].type !== 'رصيد مرحّل' || s2[0].balance !== 500) throw new Error('the new year statement should open with a carried-forward row of 500: ' + JSON.stringify(s2[0]));
        if (s2.length !== 2 || s2[1].balance !== 700) throw new Error('the new year statement should hold the carried row and the 200 invoice ending at 700: ' + JSON.stringify(s2.map(r => [r.type, r.balance])));
        // the full statement still lists both years in one running balance
        const full = await statement(customer.id);
        if (full[full.length - 1].balance !== 700) throw new Error('the full statement should end at 700');

        // ---- year 1 is locked: new, changed and deleted documents are refused
        const receipt = (await c.api('GET', '/finance/cash-receipts')).find(r => r.customer_id === customer.id && Number(r.amount) === 100);
        const checks = [
          ['a receipt dated in the closed year', () => c.api('POST', '/finance/cash-receipts', { customer_id: customer.id, amount: 5, date: '2003-12-30', payment_method: 'نقدي' })],
          ['a payment dated in the closed year', () => c.api('POST', '/finance/cash-payments', { supplier_id: supplier.id, amount: 5, date: '2003-12-30', payment_method: 'نقدي' })],
          ['deleting a receipt of the closed year', () => c.api('DELETE', `/finance/cash-receipts/${receipt.id}`)],
          ['a new sales invoice in the closed year', () => c.api('POST', '/sales-invoices', { customer_id: customer.id, warehouse_id: c.w1.id, date: '2003-12-01', subtotal: 10, total: 10, items: saleItems(10) })],
        ];
        for (const [what, fn] of checks) {
          const result = await refusedWith(fn, /مقفولة/);
          if (result !== true) throw new Error(`${what}: ${result}`);
        }
        if (Number((await customerOf(customer.id)).balance) !== 700) throw new Error('a refused change moved the customer balance');

        // ---- reopen year 1, correct the receipt, the balance follows
        await c.api('POST', `/financial-years/${y1.id}/reopen`);
        await c.api('DELETE', `/finance/cash-receipts/${receipt.id}`);
        if (Number((await customerOf(customer.id)).balance) !== 800) throw new Error('deleting the 100 receipt after reopening should raise the balance to 800');
        const s3 = await statement(customer.id, '2004-01-01');
        if (s3[0].balance !== 600) throw new Error(`the carried-forward row should follow the correction (600), it is ${s3[0].balance}`);
      } finally {
        await cleanup();
      }
    },
  },
];

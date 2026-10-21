'use strict';

// Accounting and stock invariants: rules that must hold no matter which screens
// produced the data. Each check recomputes the expected figure from the raw
// tables (or from the source document) and compares it with what the app
// actually stored or reports, so a number that is entered in one place and never
// reaches another (an invoice payment missing from the statement, a posted
// invoice with no stock movement, ...) shows up as a violation.
//
// The checker only reads. It runs against the configured database from
// scripts/check_invariants.js, and against the test database from the jest
// scenarios (tests/integration/invariants.test.js).
//
//   const { checkInvariants } = require('./invariants');
//   await checkInvariants({ models, sequelize, getJson });   // getJson(url) -> parsed body of a GET
//
// Returns [{ code, title, examined, violations: [{ severity, message }] }].

const TOL = 0.01;
const num = (v) => Number(v || 0);
const near = (a, b, tol = TOL) => Math.abs(num(a) - num(b)) <= tol;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const fmt = (v) => round2(v).toLocaleString('en-US');

const IN_TYPES = new Set(['إضافة', 'تحويل داخل', 'فاتورة شراء', 'مرتجع بيع']);
const OUT_TYPES = new Set(['صرف', 'تحويل خارج', 'فاتورة بيع', 'مرتجع شراء']);

function buildChecks({ models, sequelize, getJson }) {
  const tn = (name) => '`' + models[name].tableName + '`';
  const rows = async (sql) => (await sequelize.query(sql))[0];
  const err = (message) => ({ severity: 'error', message });
  const warn = (message) => ({ severity: 'warning', message });

  // ---- party balances: the list, the statement and the raw ledger agree -------
  const partyBalanceCheck = (kind) => async () => {
    const isCustomer = kind === 'customer';
    const base = isCustomer ? '/api/customers' : '/api/suppliers';
    const parties = await rows(isCustomer
      ? `SELECT c.id, c.name,
           (SELECT COALESCE(SUM(total),0) FROM ${tn('SalesInvoice')} WHERE customer_id=c.id AND status='posted')
         - (SELECT COALESCE(SUM(amount),0) FROM ${tn('CashReceipt')} WHERE customer_id=c.id)
         - (SELECT COALESCE(SUM(total),0) FROM ${tn('SalesReturn')} WHERE customer_id=c.id)
         - (SELECT COALESCE(SUM(amount),0) FROM ${tn('Check')} WHERE party_type='customer' AND party_id=c.id AND status<>'bounced')
         + (SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM ${tn('OpeningBalance')} WHERE party_type='customer' AND party_id=c.id) AS expected
         FROM ${tn('Customer')} c`
      : `SELECT s.id, s.name,
           (SELECT COALESCE(SUM(total),0) FROM ${tn('PurchaseInvoice')} WHERE supplier_id=s.id AND status='posted')
         - (SELECT COALESCE(SUM(amount),0) FROM ${tn('CashPayment')} WHERE supplier_id=s.id)
         - (SELECT COALESCE(SUM(total),0) FROM ${tn('PurchaseReturn')} WHERE supplier_id=s.id)
         - (SELECT COALESCE(SUM(amount),0) FROM ${tn('Check')} WHERE party_type='supplier' AND party_id=s.id AND status<>'bounced')
         + (SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) FROM ${tn('OpeningBalance')} WHERE party_type='supplier' AND party_id=s.id) AS expected
         FROM ${tn('Supplier')} s`);
    const list = await getJson(base);
    const listed = new Map(list.map(p => [p.id, num(p.balance)]));
    const violations = [];
    for (const p of parties) {
      const label = `${isCustomer ? 'العميل' : 'المورد'} "${p.name}"`;
      const shown = listed.get(p.id);
      if (shown === undefined || !near(shown, p.expected)) {
        violations.push(err(`${label}: رصيد القائمة ${fmt(shown)} لا يساوي الرصيد المحسوب من المستندات ${fmt(p.expected)}`));
      }
      const statement = await getJson(`${base}/${p.id}/statement`);
      const last = statement.length ? num(statement[statement.length - 1].balance) : 0;
      if (!near(last, shown)) {
        violations.push(err(`${label}: آخر رصيد في كشف الحساب ${fmt(last)} لا يساوي رصيد القائمة ${fmt(shown)}`));
      }
    }
    return { examined: parties.length, violations };
  };

  // ---- a payment typed on an invoice is recorded as a receipt / payment ------
  const invoicePaymentCheck = (kind) => async () => {
    const isSales = kind === 'sales';
    const sql = isSales
      ? `SELECT i.id, i.invoice_no, i.paid,
           (SELECT COALESCE(SUM(r.amount),0) FROM ${tn('CashReceipt')} r WHERE r.customer_id=i.customer_id AND r.notes = CONCAT('دفعة فاتورة بيع ', i.invoice_no)) AS recorded
         FROM ${tn('SalesInvoice')} i WHERE i.status='posted' AND i.paid>0`
      : `SELECT i.id, i.invoice_no, i.paid,
           (SELECT COALESCE(SUM(p.amount),0) FROM ${tn('CashPayment')} p WHERE p.supplier_id=i.supplier_id AND p.notes = CONCAT('دفعة فاتورة شراء ', i.invoice_no)) AS recorded
         FROM ${tn('PurchaseInvoice')} i WHERE i.status='posted' AND i.paid>0`;
    const found = await rows(sql);
    const violations = found.filter(r => !near(r.recorded, r.paid)).map(r => err(
      `${isSales ? 'فاتورة بيع' : 'فاتورة شراء'} ${r.invoice_no}: مدفوع ${fmt(r.paid)} والمسجّل ${isSales ? 'كسند قبض' : 'كسند دفع'} ${fmt(r.recorded)}`));
    return { examined: found.length, violations };
  };

  const remainingCheck = async () => {
    const violations = [];
    let examined = 0;
    for (const [model, label] of [['SalesInvoice', 'فاتورة بيع'], ['PurchaseInvoice', 'فاتورة شراء']]) {
      const found = await rows(`SELECT invoice_no, total, paid, remaining FROM ${tn(model)}`);
      examined += found.length;
      for (const r of found) {
        if (num(r.paid) < 0 || num(r.paid) > num(r.total) + TOL) violations.push(err(`${label} ${r.invoice_no}: المدفوع ${fmt(r.paid)} خارج حدود الإجمالي ${fmt(r.total)}`));
        if (!near(r.remaining, num(r.total) - num(r.paid))) violations.push(err(`${label} ${r.invoice_no}: المتبقي ${fmt(r.remaining)} لا يساوي الإجمالي ${fmt(r.total)} ناقص المدفوع ${fmt(r.paid)}`));
      }
    }
    return { examined, violations };
  };

  // ---- stock balances equal the replay of their movements --------------------
  const stockVsMovementsCheck = async () => {
    const movements = await rows(`SELECT item_id, warehouse_id, movement_type, quantity, weight, description FROM ${tn('StockMovement')} ORDER BY id ASC`);
    const expected = new Map();
    const get = (k) => { if (!expected.has(k)) expected.set(k, { q: 0, w: 0 }); return expected.get(k); };
    for (const m of movements) {
      const e = get(`${m.item_id}|${m.warehouse_id}`);
      const q = num(m.quantity), w = num(m.weight);
      if (m.movement_type === 'تعديل جرد') { e.q = q; e.w = w; }
      else if (m.movement_type === 'تركيب') {
        // the produced item is added; a component is issued (a negative component is an addition)
        const sign = (m.description || '').includes('ناتج') ? 1 : -1;
        e.q += sign * q; e.w += sign * w;
      } else if (IN_TYPES.has(m.movement_type)) { e.q += q; e.w += w; }
      else if (OUT_TYPES.has(m.movement_type)) { e.q -= q; e.w -= w; }
    }
    const stocks = await rows(`SELECT s.item_id, s.warehouse_id, s.quantity, s.weight, i.name AS item, w.name AS warehouse
      FROM ${tn('Stock')} s LEFT JOIN ${tn('Item')} i ON i.id=s.item_id LEFT JOIN ${tn('Warehouse')} w ON w.id=s.warehouse_id`);
    const names = new Map(stocks.map(s => [`${s.item_id}|${s.warehouse_id}`, `${s.item} / ${s.warehouse}`]));
    const violations = [];
    const seen = new Set();
    for (const s of stocks) {
      const key = `${s.item_id}|${s.warehouse_id}`;
      seen.add(key);
      const e = expected.get(key) || { q: 0, w: 0 };
      if (!near(s.quantity, e.q) || !near(s.weight, e.w)) {
        violations.push(err(`رصيد "${names.get(key)}": المخزن ${fmt(s.weight)} كجم / ${fmt(s.quantity)} والحركات تعطي ${fmt(e.w)} كجم / ${fmt(e.q)}`));
      }
    }
    for (const [key, e] of expected) {
      if (!seen.has(key) && (!near(e.q, 0) || !near(e.w, 0))) {
        violations.push(err(`حركات على الصنف/المخزن (${key}) تعطي ${fmt(e.w)} كجم / ${fmt(e.q)} ولا يوجد سجل رصيد لهما`));
      }
    }
    return { examined: stocks.length, violations };
  };

  // ---- posted documents have the stock movements they should ------------------
  const movementSums = async (type) => {
    const found = await rows(`SELECT item_id, description, SUM(quantity) AS q, SUM(weight) AS w FROM ${tn('StockMovement')} WHERE movement_type='${type}' GROUP BY item_id, description`);
    return new Map(found.map(r => [`${r.item_id}|${r.description}`, { q: num(r.q), w: num(r.w) }]));
  };

  const salesInvoiceMovementsCheck = async () => {
    const violations = [];
    const lines = await rows(`SELECT i.invoice_no, i.warehouse_id, it.item_id, m.name AS item,
        SUM(CASE WHEN it.quantity>0 OR it.weight>0 THEN it.quantity ELSE 0 END) AS q, SUM(CASE WHEN it.quantity>0 OR it.weight>0 THEN it.weight ELSE 0 END) AS w
      FROM ${tn('SalesInvoice')} i JOIN ${tn('SalesInvoiceItem')} it ON it.invoice_id=i.id JOIN ${tn('Item')} m ON m.id=it.item_id AND m.is_stockable=1
      WHERE i.status='posted' AND i.delivery_note_id IS NULL GROUP BY i.id, i.invoice_no, i.warehouse_id, it.item_id, m.name`);
    const moved = await movementSums('فاتورة بيع');
    for (const l of lines) {
      if (!l.warehouse_id) { violations.push(err(`فاتورة بيع ${l.invoice_no}: مرحّلة بأصناف مخزنية وبدون مخزن`)); continue; }
      if (!(num(l.q) > 0 || num(l.w) > 0)) continue;
      const got = moved.get(`${l.item_id}|فاتورة بيع ${l.invoice_no}`) || { q: 0, w: 0 };
      if (!near(got.q, l.q) || !near(got.w, l.w)) {
        violations.push(err(`فاتورة بيع ${l.invoice_no}: "${l.item}" على الفاتورة ${fmt(l.w)} كجم / ${fmt(l.q)} وحركة المخزن ${fmt(got.w)} كجم / ${fmt(got.q)}`));
      }
    }
    return { examined: lines.length, violations };
  };

  const purchaseInvoiceMovementsCheck = async () => {
    const violations = [];
    const lines = await rows(`SELECT i.invoice_no, i.warehouse_id, it.item_id, m.name AS item,
        SUM(CASE WHEN it.quantity>0 OR it.weight>0 THEN it.quantity ELSE 0 END) AS q, SUM(CASE WHEN it.quantity>0 OR it.weight>0 THEN it.weight ELSE 0 END) AS w
      FROM ${tn('PurchaseInvoice')} i JOIN ${tn('PurchaseInvoiceItem')} it ON it.invoice_id=i.id JOIN ${tn('Item')} m ON m.id=it.item_id AND m.is_stockable=1
      WHERE i.status='posted' GROUP BY i.id, i.invoice_no, i.warehouse_id, it.item_id, m.name`);
    const moved = await movementSums('فاتورة شراء');
    for (const l of lines) {
      if (!l.warehouse_id) { violations.push(err(`فاتورة شراء ${l.invoice_no}: مرحّلة بأصناف مخزنية وبدون مخزن`)); continue; }
      if (!(num(l.q) > 0 || num(l.w) > 0)) continue;
      const got = moved.get(`${l.item_id}|فاتورة شراء ${l.invoice_no}`) || { q: 0, w: 0 };
      if (!near(got.q, l.q) || !near(got.w, l.w)) {
        violations.push(err(`فاتورة شراء ${l.invoice_no}: "${l.item}" على الفاتورة ${fmt(l.w)} كجم / ${fmt(l.q)} وحركة المخزن ${fmt(got.w)} كجم / ${fmt(got.q)}`));
      }
    }
    return { examined: lines.length, violations };
  };

  const deliveryNotesCheck = async () => {
    const violations = [];
    const notes = await rows(`SELECT n.id, n.note_no, n.status, n.invoice_no, n.warehouse_id,
        (SELECT COUNT(*) FROM ${tn('SalesInvoice')} i WHERE i.delivery_note_id=n.id) AS invoices
      FROM ${tn('DeliveryNote')} n`);
    const moved = await movementSums('فاتورة بيع');
    for (const n of notes) {
      if (n.status === 'delivered' && num(n.invoices) !== 1) violations.push(err(`إذن تسليم ${n.note_no}: مرحّل وله ${n.invoices} فاتورة (المتوقع واحدة)`));
      if (n.status === 'pending' && num(n.invoices) !== 0) violations.push(err(`إذن تسليم ${n.note_no}: معلق ومع ذلك له فاتورة`));
      if (n.status !== 'delivered' || !n.warehouse_id) continue;
      const items = await rows(`SELECT di.item_id, m.name AS item, SUM(COALESCE(NULLIF(di.net_weight,0), di.gross_weight, 0)) AS w, SUM(di.roll_count) AS q,
          SUM(CASE WHEN COALESCE(NULLIF(di.net_weight,0), di.gross_weight, 0)<=0 AND di.roll_count<=0 THEN 1 ELSE 0 END) AS empty_lines
        FROM ${tn('DeliveryNoteItem')} di JOIN ${tn('Item')} m ON m.id=di.item_id WHERE di.note_id=${Number(n.id)} GROUP BY di.item_id, m.name`);
      for (const it of items) {
        if (num(it.w) <= 0 && num(it.q) <= 0) continue;
        const got = moved.get(`${it.item_id}|إذن تسليم رقم ${n.note_no}`) || { q: 0, w: 0 };
        if (!near(got.q, it.q) || !near(got.w, it.w)) {
          violations.push(err(`إذن تسليم ${n.note_no}: "${it.item}" في الإذن ${fmt(it.w)} كجم / ${fmt(it.q)} وحركة المخزن ${fmt(got.w)} كجم / ${fmt(got.q)}`));
        }
      }
    }
    return { examined: notes.length, violations };
  };

  const returnsCheck = (kind) => async () => {
    const isSales = kind === 'sales';
    const [retModel, itemModel, type, label] = isSales
      ? ['SalesReturn', 'SalesReturnItem', 'مرتجع بيع', 'مرتجع بيع']
      : ['PurchaseReturn', 'PurchaseReturnItem', 'مرتجع شراء', 'مرتجع شراء'];
    const lines = await rows(`SELECT r.return_no, r.warehouse_id, it.item_id, m.name AS item, SUM(it.quantity) AS q, SUM(it.weight) AS w
      FROM ${tn(retModel)} r JOIN ${tn(itemModel)} it ON it.return_id=r.id JOIN ${tn('Item')} m ON m.id=it.item_id AND m.is_stockable=1
      GROUP BY r.id, r.return_no, r.warehouse_id, it.item_id, m.name`);
    const moved = await movementSums(type);
    const violations = [];
    for (const l of lines) {
      if (!l.warehouse_id) continue; // a return without a warehouse deliberately leaves stock alone
      const got = moved.get(`${l.item_id}|${type} ${l.return_no}`) || { q: 0, w: 0 };
      if (!near(got.q, l.q) || !near(got.w, l.w)) {
        violations.push(err(`${label} ${l.return_no}: "${l.item}" في المرتجع ${fmt(l.w)} كجم / ${fmt(l.q)} وحركة المخزن ${fmt(got.w)} كجم / ${fmt(got.q)}`));
      }
    }
    return { examined: lines.length, violations };
  };

  const transfersCheck = async () => {
    const transfers = await rows(`SELECT t.id, t.status FROM ${tn('WarehouseTransfer')} t`);
    const violations = [];
    let examined = 0;
    for (const t of transfers) {
      const items = await rows(`SELECT ti.item_id, m.name AS item, ti.quantity AS q, ti.weight AS w FROM ${tn('WarehouseTransferItem')} ti JOIN ${tn('Item')} m ON m.id=ti.item_id WHERE ti.transfer_id=${Number(t.id)}`);
      const mv = await rows(`SELECT item_id, movement_type, SUM(quantity) AS q, SUM(weight) AS w FROM ${tn('StockMovement')}
        WHERE reference='${Number(t.id)}' AND movement_type IN ('تحويل خارج','تحويل داخل') GROUP BY item_id, movement_type`);
      examined += 1;
      if (t.status === 'pending' && mv.length) violations.push(err(`تحويل ${t.id}: معلق وله حركات مخزن`));
      if (t.status !== 'confirmed') continue;
      for (const it of items) {
        for (const type of ['تحويل خارج', 'تحويل داخل']) {
          const got = mv.find(r => r.item_id === it.item_id && r.movement_type === type);
          if (!got || !near(got.q, it.q) || !near(got.w, it.w)) {
            violations.push(err(`تحويل ${t.id}: "${it.item}" ناقص أو مختلف في حركة "${type}" (المطلوب ${fmt(it.w)} كجم / ${fmt(it.q)})`));
          }
        }
      }
    }
    return { examined, violations };
  };

  const assembliesCheck = async () => {
    const assemblies = await rows(`SELECT a.id, a.assembled_item_id, a.assembled_qty, a.assembled_weight, m.name AS item FROM ${tn('ItemAssembly')} a LEFT JOIN ${tn('Item')} m ON m.id=a.assembled_item_id`);
    const violations = [];
    for (const a of assemblies) {
      if (!a.assembled_item_id || !a.item) { violations.push(warn(`تركيب ${a.id}: بدون صنف مركّب (الصنف محذوف أو غير محدد)`)); continue; }
      const out = await rows(`SELECT SUM(quantity) AS q, SUM(weight) AS w, COUNT(*) AS n FROM ${tn('StockMovement')} WHERE movement_type='تركيب' AND reference='${Number(a.id)}' AND item_id=${Number(a.assembled_item_id)} AND description LIKE 'ناتج%'`);
      if (!num(out[0].n) || !near(out[0].q, a.assembled_qty) || !near(out[0].w, a.assembled_weight)) {
        violations.push(err(`تركيب ${a.id} ("${a.item}"): حركة الناتج غير موجودة أو مختلفة عن ${fmt(a.assembled_weight)} كجم / ${fmt(a.assembled_qty)}`));
      }
      const comps = await rows(`SELECT c.item_id, m.name AS item, SUM(c.quantity) AS q, SUM(c.weight) AS w FROM ${tn('ItemAssemblyComponent')} c LEFT JOIN ${tn('Item')} m ON m.id=c.item_id
        WHERE c.assembly_id=${Number(a.id)} AND (c.is_expense IS NULL OR c.is_expense=0) GROUP BY c.item_id, m.name`);
      for (const c of comps) {
        const got = await rows(`SELECT SUM(quantity) AS q, SUM(weight) AS w, COUNT(*) AS n FROM ${tn('StockMovement')} WHERE movement_type='تركيب' AND reference='${Number(a.id)}' AND item_id=${Number(c.item_id)} AND description LIKE 'مكون%'`);
        if (!num(got[0].n) || !near(got[0].q, c.q) || !near(got[0].w, c.w)) {
          violations.push(err(`تركيب ${a.id}: المكون "${c.item}" ${fmt(c.w)} كجم / ${fmt(c.q)} وحركة المخزن ${fmt(got[0].w)} كجم / ${fmt(got[0].q)}`));
        }
      }
    }
    return { examined: assemblies.length, violations };
  };

  // ---- nothing points at something that no longer exists ----------------------
  const orphansCheck = async () => {
    const probes = [
      ['SalesInvoiceItem', 'item_id', 'Item', 'سطور فواتير بيع على صنف غير موجود'],
      ['PurchaseInvoiceItem', 'item_id', 'Item', 'سطور فواتير شراء على صنف غير موجود'],
      ['StockMovement', 'item_id', 'Item', 'حركات مخزن على صنف غير موجود'],
      ['Stock', 'item_id', 'Item', 'أرصدة مخزن على صنف غير موجود'],
      ['Stock', 'warehouse_id', 'Warehouse', 'أرصدة على مخزن غير موجود'],
      ['StockMovement', 'warehouse_id', 'Warehouse', 'حركات على مخزن غير موجود'],
      ['CashReceipt', 'customer_id', 'Customer', 'سندات قبض لعميل غير موجود'],
      ['CashPayment', 'supplier_id', 'Supplier', 'سندات دفع لمورد غير موجود'],
      ['SalesInvoice', 'customer_id', 'Customer', 'فواتير بيع لعميل غير موجود'],
      ['PurchaseInvoice', 'supplier_id', 'Supplier', 'فواتير شراء لمورد غير موجود'],
    ];
    const violations = [];
    for (const [child, col, parent, label] of probes) {
      const found = await rows(`SELECT COUNT(*) AS n FROM ${tn(child)} c LEFT JOIN ${tn(parent)} p ON p.id=c.${col} WHERE c.${col} IS NOT NULL AND p.id IS NULL`);
      if (num(found[0].n) > 0) violations.push(err(`${label}: ${found[0].n}`));
    }
    const badChecks = await rows(`SELECT check_no FROM ${tn('Check')} WHERE status='bounced' AND bounced_date IS NULL`);
    badChecks.forEach(c => violations.push(warn(`شيك ${c.check_no}: مرتد وبدون تاريخ ارتداد`)));
    const badAmounts = await rows(`SELECT 'سند قبض' AS kind, receipt_no AS no FROM ${tn('CashReceipt')} WHERE amount<=0
      UNION ALL SELECT 'سند دفع', payment_no FROM ${tn('CashPayment')} WHERE amount<=0
      UNION ALL SELECT 'شيك', check_no FROM ${tn('Check')} WHERE amount<=0`);
    badAmounts.forEach(r => violations.push(err(`${r.kind} ${r.no}: المبلغ صفر أو سالب`)));
    return { examined: probes.length + 2, violations };
  };

  return [
    { code: 'customer-balances', title: 'أرصدة العملاء: القائمة = كشف الحساب = المستندات', run: partyBalanceCheck('customer') },
    { code: 'supplier-balances', title: 'أرصدة الموردين: القائمة = كشف الحساب = المستندات', run: partyBalanceCheck('supplier') },
    { code: 'sales-invoice-payments', title: 'مدفوع فاتورة البيع له سند قبض', run: invoicePaymentCheck('sales') },
    { code: 'purchase-invoice-payments', title: 'مدفوع فاتورة الشراء له سند دفع', run: invoicePaymentCheck('purchase') },
    { code: 'invoice-remaining', title: 'المتبقي = الإجمالي − المدفوع في كل فاتورة', run: remainingCheck },
    { code: 'stock-vs-movements', title: 'رصيد كل صنف في كل مخزن = مجموع حركاته', run: stockVsMovementsCheck },
    { code: 'sales-invoice-movements', title: 'فاتورة البيع المرحّلة لها حركات مخزن مطابقة', run: salesInvoiceMovementsCheck },
    { code: 'purchase-invoice-movements', title: 'فاتورة الشراء المرحّلة لها حركات مخزن مطابقة', run: purchaseInvoiceMovementsCheck },
    { code: 'delivery-notes', title: 'إذن التسليم: فاتورة واحدة وحركات مخزن مطابقة', run: deliveryNotesCheck },
    { code: 'sales-returns', title: 'مرتجع البيع له حركات مخزن مطابقة', run: returnsCheck('sales') },
    { code: 'purchase-returns', title: 'مرتجع الشراء له حركات مخزن مطابقة', run: returnsCheck('purchase') },
    { code: 'transfers', title: 'التحويل المؤكد له حركة خارج وداخل مطابقة', run: transfersCheck },
    { code: 'assemblies', title: 'التركيب له حركات المكونات والناتج', run: assembliesCheck },
    { code: 'orphans', title: 'لا شيء يشير إلى سجل غير موجود، ولا مبالغ صفرية', run: orphansCheck },
  ];
}

async function checkInvariants({ models, sequelize, getJson, only }) {
  const results = [];
  for (const check of buildChecks({ models, sequelize, getJson })) {
    if (only && !only.includes(check.code)) continue;
    try {
      const { examined, violations } = await check.run();
      results.push({ code: check.code, title: check.title, examined, violations });
    } catch (e) {
      results.push({ code: check.code, title: check.title, examined: 0, violations: [{ severity: 'error', message: `تعذّر تنفيذ الفحص: ${e.message}` }] });
    }
  }
  return results;
}

module.exports = { checkInvariants };

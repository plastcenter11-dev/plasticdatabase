import { useState, useEffect } from 'react';
import { MdPrint } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';
import { repCommission, soldKg } from '../utils/repCommission';

// 1.14 → "1.14", 1 → "1", mixed → e.g. "1.07"; plus a word on where it came from.
const divisorText = (s) => String(Number(s.divisor.toFixed(4)));
const divisorNote = (s) => (s.divisorGuessed ? 'لا توجد فواتير في الفترة — افتراض ضريبة 14%' : s.divisor === 1 ? 'مبيعات بدون ضريبة' : s.divisor === 1.14 ? 'بدون ضريبة' : 'نسبة الأصناف بضريبة / بدون ضريبة');

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const monthStart = () => today().slice(0, 8) + '01';
const balSplit = (b) => { const n = Number(b || 0); return { debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }; };
const checkLabel = (s) => (s === 'bounced' ? 'مرتد' : s === 'collected' ? 'تم التحصيل' : 'قيد الانتظار');
const typeColor = (type) => {
  if (type === 'فاتورة بيع' || type === 'شيك مرتد') return 'text-red-600';
  if (type === 'مرتجع بيع') return 'text-green-600';
  return 'text-blue-600';
};

// Account movements for every customer of one sales representative over a chosen period.
// Only customers that actually had movement in the period are shown.
export default function RepStatementsPage() {
  const [customers, setCustomers] = useState([]);
  const [rep, setRep] = useState('');
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState([]);
  const [repCount, setRepCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [rate, setRate] = useState(null);

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
  }, []);
  const reps = [...new Set(customers.map(c => (c.sales_rep || '').trim()).filter(Boolean))].sort();
  // The rep's commission % comes from the employee with the same name (شاشة الموظفين).
  const repEmployee = employees.find(e => (e.name || '').trim() === rep);
  // `rate` is null until the reviewer types an override; picking another rep clears it.
  const shownRate = rate ?? (repEmployee ? String(Number(repEmployee.commission_rate || 0)) : '');
  const ratePct = Number(shownRate || 0);

  useEffect(() => {
    if (!rep || !dateFrom || !dateTo) { setData([]); setRepCount(0); return; }
    let cancelled = false;
    setLoading(true);
    const mine = customers.filter(c => (c.sales_rep || '').trim() === rep).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setRepCount(mine.length);
    Promise.all(mine.map(c => api.get(`/customers/${c.id}/statement`, { params: { from: dateFrom, to: dateTo } })
      .then(r => ({ customer: c, rows: r.data })).catch(() => ({ customer: c, rows: [] }))))
      .then(list => { if (!cancelled) setData(list.filter(x => x.rows.some(r => !r.isOpening))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rep, dateFrom, dateTo, customers]);

  const summarize = ({ customer, rows }) => {
    const opening = rows.find(r => r.isOpening);
    const c = repCommission(rows, ratePct);
    const { moves, invoices } = c;
    const sum = (list, k) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
    return {
      ...c, customer, rows,
      opening: Number(opening?.balance || 0),
      kg: invoices.reduce((s, r) => s + soldKg(r.items), 0),
      sales: sum(invoices, 'debit'),
      debit: sum(moves, 'debit'),
      credit: sum(moves, 'credit'),
      closing: Number(rows.length ? rows[rows.length - 1].balance : 0),
    };
  };
  const summaries = data.map(summarize);
  const total = (key) => summaries.reduce((s, x) => s + x[key], 0);

  const describe = (r) => `${r.type} ${r.reference || ''}${r.check_due_date ? ` — استحقاق: ${r.check_due_date}` : ''}${r.check_bounced_date ? ` — ارتداد: ${r.check_bounced_date}` : ''}${r.check_status ? ` (${checkLabel(r.check_status)})` : ''}`;

  const handlePrint = () => {
    const section = (s) => `
      <section>
        <h2>${s.customer.name}</h2>
        <div class="info"><span>المندوب: <strong>${rep}</strong></span><span>من ${dateFrom} إلى ${dateTo}</span></div>
        <table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>رصيد مدين</th><th>رصيد دائن</th></tr></thead><tbody>
        ${s.rows.map(r => `
          <tr${r.isOpening ? ' class="sub"' : ''}><td>${r.date || ''}</td><td>${r.isOpening ? r.type : describe(r)}</td><td>${r.debit ? fmt(r.debit) : ''}</td><td>${r.credit ? fmt(r.credit) : ''}</td><td>${fmt(balSplit(r.balance).debit)}</td><td>${fmt(balSplit(r.balance).credit)}</td></tr>
          ${r.items?.length ? `<tr class="items"><td></td><td colspan="5"><table><thead><tr><th>الصنف</th><th>الوزن (كجم)</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${r.items.map(it => `<tr><td>${it.Item?.name || ''}</td><td>${Number(it.weight || 0) > 0 ? Number(it.weight).toLocaleString() : '—'}</td><td>${Number(it.quantity).toLocaleString()}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody></table>${(r.discount > 0 || r.tax_amount > 0) ? `<div class="note">${r.discount > 0 ? `خصم: ${fmt(r.discount)}  ` : ''}${r.tax_amount > 0 ? `ضريبة (${r.tax_rate}%): ${fmt(r.tax_amount)}` : ''}</div>` : ''}</td></tr>` : ''}`).join('')}
        <tr class="sub"><td colspan="2">الإجمالي / الرصيد النهائي</td><td>${fmt(s.debit)}</td><td>${fmt(s.credit)}</td><td>${fmt(balSplit(s.closing).debit)}</td><td>${fmt(balSplit(s.closing).credit)}</td></tr>
        </tbody></table>
        <div class="totals"><span>الوزن المباع: <strong>${s.kg.toLocaleString()} كجم</strong></span><span>المبيعات: <strong>${fmt(s.sales)}</strong></span><span>مرتجعات وخصومات: <strong>${fmt(s.returns)}</strong></span><span>المدفوع: <strong>${fmt(s.paid)}</strong></span>${s.bounced ? `<span>شيكات مرتدة: <strong>${fmt(s.bounced)}</strong></span>` : ''}</div>
        <div class="comm">العمولة: الدفعات ${fmt(s.paid)}${s.bounced ? ` − شيكات مرتدة ${fmt(s.bounced)}` : ''} − مرتجعات وخصم نقدي ${fmt(s.returns)} − أكلاشيهات وسلندرات ${fmt(s.plates)} = ${fmt(s.base)} ÷ ${divisorText(s)} (${divisorNote(s)}) = <strong>${fmt(s.exTax)}</strong> × ${ratePct}% =<strong>${fmt(s.commission)}</strong></div>
      </section>`;
    const summaryPage = `
      <section>
        <h1>حركة عملاء المندوب: ${rep}</h1>
        <div class="info"><span>من ${dateFrom} إلى ${dateTo}</span><span>عملاء لهم حركة: ${summaries.length} من ${repCount}</span></div>
        <table><thead><tr><th>العميل</th><th>رصيد أول المدة</th><th>الوزن (كجم)</th><th>المبيعات</th><th>مرتجعات وخصومات</th><th>المدفوع</th><th>شيكات مرتدة</th><th>أكلاشيهات وسلندرات</th><th>الرصيد آخر المدة</th><th>الصافي</th><th>الصافي بدون ضريبة</th><th>العمولة (${ratePct}%)</th></tr></thead><tbody>
        ${summaries.map(s => `<tr><td>${s.customer.name}</td><td>${fmt(s.opening)}</td><td>${s.kg.toLocaleString()}</td><td>${fmt(s.sales)}</td><td>${fmt(s.returns)}</td><td>${fmt(s.paid)}</td><td>${fmt(s.bounced)}</td><td>${fmt(s.plates)}</td><td>${fmt(s.closing)}</td><td>${fmt(s.base)}</td><td>${fmt(s.exTax)}</td><td>${fmt(s.commission)}</td></tr>`).join('')}
        <tr class="sub"><td>الإجمالي</td><td>${fmt(total('opening'))}</td><td>${total('kg').toLocaleString()}</td><td>${fmt(total('sales'))}</td><td>${fmt(total('returns'))}</td><td>${fmt(total('paid'))}</td><td>${fmt(total('bounced'))}</td><td>${fmt(total('plates'))}</td><td>${fmt(total('closing'))}</td><td>${fmt(total('base'))}</td><td>${fmt(total('exTax'))}</td><td>${fmt(total('commission'))}</td></tr>
        </tbody></table>
        <div class="comm big">إجمالي عمولة المندوب ${rep} عن الفترة: <strong>${fmt(total('commission'))}</strong></div>
      </section>`;
    const html = `<html dir="rtl"><head><title>حركة عملاء المندوب ${rep}</title>
    <style>body{font-family:Cairo,sans-serif;padding:30px;direction:rtl}h1{font-size:20px;text-align:center}h2{font-size:18px;margin:0 0 8px}section{page-break-after:always}section:last-child{page-break-after:auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:5px 7px;text-align:right;font-size:13px}th{background:#f0f0f0}.sub td{background:#f3f3f3;font-weight:bold}.items td{font-size:12px}.items table{margin:4px 0}.items th,.items td{border-color:#999;padding:3px 6px}.note{font-size:12px;color:#555}.info,.totals{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:14px}.totals{border-top:2px solid #333;padding-top:8px}.comm{margin-top:8px;padding:8px;border:1px solid #333;background:#f7f7f7;font-size:14px}.comm.big{font-size:17px;text-align:center}</style></head><body>
    ${summaryPage}${summaries.map(section).join('')}</body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">كشوف حساب مندوب — حركة عملائه خلال الفترة</h1>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="form-label">المندوب</label>
          <SearchableSelect className="erp-input" value={rep} onChange={e => { setRep(e.target.value); setRate(null); }}>
            <option value="">— اختر المندوب —</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </SearchableSelect>
        </div>
        <div><label className="form-label">من</label><input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="form-label">إلى</label><input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {rep && (
          <div className="w-32">
            <label className="form-label">نسبة العمولة %</label>
            <input type="number" step="0.1" className="erp-input" value={shownRate} onChange={e => setRate(e.target.value)} />
          </div>
        )}
        {rep && summaries.length > 0 && <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!rep && <div className="text-center py-16 text-gray-400">{reps.length ? 'اختر المندوب والفترة' : 'لم يُكتب مندوب لأي عميل بعد (تعريف العملاء ← مندوب البيع)'}</div>}
      {rep && loading && <div className="text-center py-8 text-gray-400">جارٍ التحميل...</div>}

      {rep && !loading && (
        <>
          {!repEmployee && <div className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2">المندوب «{rep}» غير معرّف في شاشة الموظفين، فلا توجد له نسبة عمولة محفوظة. أضفه في الموظفين بنفس الاسم مع نسبة العمولة، أو اكتب النسبة هنا للمراجعة فقط.</div>}
          <div className="text-sm text-gray-500">عملاء لهم حركة في الفترة: <strong className="text-gray-800">{summaries.length}</strong> من {repCount} عميل للمندوب</div>
          {summaries.length === 0 && <div className="bg-white rounded-xl shadow-sm text-center py-10 text-gray-400">لا توجد حركة لعملاء هذا المندوب في الفترة المختارة</div>}

          {summaries.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="erp-table">
                <thead><tr><th>العميل</th><th>رصيد أول المدة</th><th>الوزن (كجم)</th><th>المبيعات</th><th>مرتجعات وخصومات</th><th>المدفوع</th><th>شيكات مرتدة</th><th>أكلاشيهات وسلندرات</th><th>الرصيد آخر المدة</th><th>الصافي</th><th>الصافي بدون ضريبة</th><th>العمولة ({ratePct}%)</th></tr></thead>
                <tbody>
                  {summaries.map(s => (
                    <tr key={s.customer.id}>
                      <td className="font-medium"><a href={`#rep-cust-${s.customer.id}`} className="text-primary hover:underline">{s.customer.name}</a></td>
                      <td>{fmt(s.opening)}</td><td>{s.kg.toLocaleString()}</td>
                      <td className="text-red-600">{fmt(s.sales)}</td><td>{fmt(s.returns)}</td><td className="text-green-600">{fmt(s.paid)}</td><td>{fmt(s.bounced)}</td><td>{fmt(s.plates)}</td><td className="font-bold">{fmt(s.closing)}</td><td>{fmt(s.base)}</td><td>{fmt(s.exTax)}</td><td className="font-bold text-primary">{fmt(s.commission)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-gray-100 font-bold">
                  <td>الإجمالي</td><td>{fmt(total('opening'))}</td><td>{total('kg').toLocaleString()}</td><td>{fmt(total('sales'))}</td><td>{fmt(total('returns'))}</td><td>{fmt(total('paid'))}</td><td>{fmt(total('bounced'))}</td><td>{fmt(total('plates'))}</td><td>{fmt(total('closing'))}</td><td>{fmt(total('base'))}</td><td>{fmt(total('exTax'))}</td><td className="text-primary">{fmt(total('commission'))}</td>
                </tr></tfoot>
              </table>
              <div className="px-4 py-3 border-t bg-blue-50 text-lg font-bold text-gray-800 flex justify-between flex-wrap gap-2">
                <span>إجمالي عمولة المندوب عن الفترة</span>
                <span className="text-primary">{fmt(total('commission'))} ج.م</span>
              </div>
            </div>
          )}

          {summaries.map(s => (
            <div key={s.customer.id} id={`rep-cust-${s.customer.id}`} className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <div className="px-4 py-3 border-b flex justify-between flex-wrap gap-2">
                <h2 className="font-bold text-gray-800">{s.customer.name}</h2>
                <span className="text-sm text-gray-500">الوزن المباع: {s.kg.toLocaleString()} كجم</span>
              </div>
              <table className="erp-table">
                <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (له)</th><th>رصيد مدين</th><th>رصيد دائن</th></tr></thead>
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className={r.isOpening ? 'bg-gray-50' : ''}>
                      <td>{r.date}</td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${r.isOpening ? 'text-gray-700' : typeColor(r.type)}`}>{r.type}</span>
                            {!r.isOpening && <span className="font-mono text-sm text-gray-600">{r.reference}</span>}
                            {r.check_status && <span className={`badge text-xs ${r.check_status === 'bounced' ? 'badge-red' : r.check_status === 'collected' ? 'badge-green' : 'badge-yellow'}`}>{checkLabel(r.check_status)}</span>}
                          </div>
                          {r.check_due_date && <div className="text-xs text-gray-500">تاريخ الاستحقاق: {r.check_due_date}</div>}
                          {r.check_bounced_date && <div className="text-xs text-red-500">تاريخ الارتداد: {r.check_bounced_date}</div>}
                          {r.items?.length > 0 && (
                            <div className="text-xs text-gray-500 pr-2 border-r-2 border-blue-200 space-y-0.5 mt-0.5">
                              {r.items.map((it, j) => {
                                const wt = Number(it.weight || 0);
                                const unit = wt > 0 ? `${wt.toLocaleString()} كجم` : `${Number(it.quantity).toLocaleString()} عدد`;
                                return <div key={j}>{it.Item?.name || it.item_id} — {unit} × {Number(it.price).toLocaleString()} = <span className="text-gray-700 font-medium">{fmt(it.total)} ج.م</span></div>;
                              })}
                              {(r.discount > 0 || r.tax_amount > 0) && (
                                <div className="flex gap-3 pt-0.5 border-t border-gray-200 flex-wrap">
                                  {r.discount > 0 && <span className="text-red-500">خصم: {fmt(r.discount)} ج.م</span>}
                                  {r.tax_amount > 0 && <span className="text-green-600">ضريبة ({r.tax_rate}%): {fmt(r.tax_amount)} ج.م</span>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={r.debit ? 'text-red-600 font-medium' : ''}>{r.debit ? fmt(r.debit) : ''}</td>
                      <td className={r.credit ? 'text-green-600 font-medium' : ''}>{r.credit ? fmt(r.credit) : ''}</td>
                      <td className="font-bold">{fmt(balSplit(r.balance).debit)}</td>
                      <td className="font-bold">{fmt(balSplit(r.balance).credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-gray-100 font-bold">
                  <td colSpan={2}>الرصيد النهائي</td>
                  <td className="text-red-600">{fmt(s.debit)}</td>
                  <td className="text-green-600">{fmt(s.credit)}</td>
                  <td className="text-primary">{fmt(balSplit(s.closing).debit)}</td>
                  <td className="text-primary">{fmt(balSplit(s.closing).credit)}</td>
                </tr></tfoot>
              </table>
              <div className="px-4 py-3 border-t bg-blue-50 text-sm text-gray-700 flex flex-wrap gap-x-2 gap-y-1 items-center">
                <span className="font-bold">العمولة:</span>
                <span>الدفعات {fmt(s.paid)}</span>
                {s.bounced > 0 && <span>− شيكات مرتدة {fmt(s.bounced)}</span>}
                <span>− مرتجعات وخصم نقدي {fmt(s.returns)}</span>
                <span>− أكلاشيهات وسلندرات {fmt(s.plates)}</span>
                <span>= {fmt(s.base)}</span>
                <span>÷ {divisorText(s)} <span className={s.divisorGuessed ? 'text-yellow-700' : ''}>({divisorNote(s)})</span> = <strong>{fmt(s.exTax)}</strong></span>
                <span>× {ratePct}% =</span>
                <span className="font-bold text-primary text-base">{fmt(s.commission)} ج.م</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

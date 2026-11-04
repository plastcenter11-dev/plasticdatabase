import { useState, useEffect } from 'react';
import { MdPrint } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgOf = (items) => (items || []).reduce((s, it) => s + Number(it.weight || 0), 0);
const lastDay = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

// Monthly statement for every customer of one sales representative: quantities, prices and payments.
export default function RepStatementsPage() {
  const [customers, setCustomers] = useState([]);
  const [rep, setRep] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/customers').then(r => setCustomers(r.data)).catch(() => {}); }, []);
  const reps = [...new Set(customers.map(c => (c.sales_rep || '').trim()).filter(Boolean))].sort();
  const from = `${month}-01`;
  const to = lastDay(month);

  useEffect(() => {
    if (!rep || !month) { setData([]); return; }
    let cancelled = false;
    setLoading(true);
    const mine = customers.filter(c => (c.sales_rep || '').trim() === rep);
    Promise.all(mine.map(c => api.get(`/customers/${c.id}/statement`, { params: { from, to } })
      .then(r => ({ customer: c, rows: r.data })).catch(() => ({ customer: c, rows: [] }))))
      .then(list => { if (!cancelled) setData(list); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rep, month, customers]);

  const summarize = ({ customer, rows }) => {
    const opening = rows.find(r => r.isOpening);
    const moves = rows.filter(r => !r.isOpening);
    const invoices = moves.filter(r => r.type === 'فاتورة بيع');
    const returns = moves.filter(r => r.type === 'مرتجع بيع');
    const paid = moves.filter(r => r.type === 'تحصيل' || r.type === 'شيك');
    return {
      customer, rows, opening: Number(opening?.balance || 0),
      kg: invoices.reduce((s, r) => s + kgOf(r.items), 0),
      sales: invoices.reduce((s, r) => s + Number(r.debit), 0),
      returns: returns.reduce((s, r) => s + Number(r.credit), 0),
      paid: paid.reduce((s, r) => s + Number(r.credit), 0),
      closing: Number(rows.length ? rows[rows.length - 1].balance : 0),
    };
  };
  const summaries = data.map(summarize);
  const total = (key) => summaries.reduce((s, x) => s + x[key], 0);

  const handlePrint = () => {
    const section = (s) => `
      <section>
        <h2>${s.customer.name}</h2>
        <div class="info"><span>المندوب: <strong>${rep}</strong></span><span>عن شهر ${month} (من ${from} إلى ${to})</span><span>رصيد أول الشهر: <strong>${fmt(s.opening)}</strong></span></div>
        <table><thead><tr><th>التاريخ</th><th>البيان</th><th>الصنف</th><th>الوزن (كجم)</th><th>السعر</th><th>الإجمالي</th><th>مدفوع</th></tr></thead><tbody>
        ${s.rows.filter(r => !r.isOpening).map(r => {
          if (r.items?.length) return r.items.map((it, i) => `<tr><td>${i === 0 ? r.date : ''}</td><td>${i === 0 ? `${r.type} ${r.reference}` : ''}</td><td>${it.Item?.name || ''}</td><td>${Number(it.weight || 0) > 0 ? Number(it.weight).toLocaleString() : '—'}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td><td></td></tr>`).join('')
            + ((r.discount > 0 || r.tax_amount > 0) ? `<tr class="sub"><td colspan="7">${r.discount > 0 ? `خصم: ${fmt(r.discount)}  ` : ''}${r.tax_amount > 0 ? `ضريبة (${r.tax_rate}%): ${fmt(r.tax_amount)}  ` : ''}إجمالي ${r.type}: ${fmt(r.debit || r.credit)}</td></tr>` : '');
          return `<tr><td>${r.date || ''}</td><td>${r.type} ${r.reference || ''}</td><td></td><td></td><td></td><td></td><td>${r.credit ? fmt(r.credit) : ''}</td></tr>`;
        }).join('')}
        </tbody></table>
        <div class="totals"><span>إجمالي المبيعات: <strong>${fmt(s.sales)}</strong></span><span>الوزن المباع: <strong>${s.kg.toLocaleString()} كجم</strong></span><span>المرتجعات: <strong>${fmt(s.returns)}</strong></span><span>المدفوع: <strong>${fmt(s.paid)}</strong></span><span>الرصيد في آخر الشهر: <strong>${fmt(s.closing)}</strong></span></div>
      </section>`;
    const summaryPage = `
      <section>
        <h1>ملخص شهر ${month} — مندوب: ${rep}</h1>
        <table><thead><tr><th>العميل</th><th>الوزن (كجم)</th><th>المبيعات</th><th>المرتجعات</th><th>المدفوع</th><th>الرصيد آخر الشهر</th></tr></thead><tbody>
        ${summaries.map(s => `<tr><td>${s.customer.name}</td><td>${s.kg.toLocaleString()}</td><td>${fmt(s.sales)}</td><td>${fmt(s.returns)}</td><td>${fmt(s.paid)}</td><td>${fmt(s.closing)}</td></tr>`).join('')}
        <tr class="sub"><td>الإجمالي</td><td>${total('kg').toLocaleString()}</td><td>${fmt(total('sales'))}</td><td>${fmt(total('returns'))}</td><td>${fmt(total('paid'))}</td><td>${fmt(total('closing'))}</td></tr>
        </tbody></table>
      </section>`;
    const html = `<html dir="rtl"><head><title>كشوف حساب المندوب ${rep} - ${month}</title>
    <style>body{font-family:Cairo,sans-serif;padding:30px;direction:rtl}h1{font-size:20px;text-align:center}h2{font-size:18px;margin:0 0 8px}section{page-break-after:always}section:last-child{page-break-after:auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:5px 7px;text-align:right;font-size:13px}th{background:#f0f0f0}.sub td{background:#f9f9f9;font-size:12px;color:#555;font-weight:bold}.info,.totals{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:14px}.totals{border-top:2px solid #333;padding-top:8px}</style></head><body>
    ${summaryPage}${summaries.map(section).join('')}</body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">كشوف حساب شهرية لعملاء مندوب</h1>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="form-label">المندوب</label>
          <SearchableSelect className="erp-input" value={rep} onChange={e => setRep(e.target.value)}>
            <option value="">— اختر المندوب —</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </SearchableSelect>
        </div>
        <div><label className="form-label">الشهر</label><input type="month" className="erp-input" value={month} onChange={e => setMonth(e.target.value)} /></div>
        {rep && summaries.length > 0 && <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة كل الكشوف</button>}
      </div>

      {!rep && <div className="text-center py-16 text-gray-400">{reps.length ? 'اختر المندوب والشهر' : 'لم يُكتب مندوب لأي عميل بعد (تعريف العملاء ← مندوب البيع)'}</div>}
      {rep && loading && <div className="text-center py-8 text-gray-400">جارٍ التحميل...</div>}

      {rep && !loading && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th>العميل</th><th>رصيد أول الشهر</th><th>الوزن (كجم)</th><th>المبيعات</th><th>المرتجعات</th><th>المدفوع</th><th>الرصيد آخر الشهر</th></tr></thead>
            <tbody>
              {summaries.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا يوجد عملاء لهذا المندوب</td></tr>}
              {summaries.map(s => (
                <tr key={s.customer.id}>
                  <td className="font-medium">{s.customer.name}</td><td>{fmt(s.opening)}</td><td>{s.kg.toLocaleString()}</td>
                  <td className="text-red-600">{fmt(s.sales)}</td><td>{fmt(s.returns)}</td><td className="text-green-600">{fmt(s.paid)}</td><td className="font-bold">{fmt(s.closing)}</td>
                </tr>
              ))}
            </tbody>
            {summaries.length > 0 && (
              <tfoot><tr className="bg-gray-100 font-bold">
                <td>الإجمالي</td><td>{fmt(total('opening'))}</td><td>{total('kg').toLocaleString()}</td><td>{fmt(total('sales'))}</td><td>{fmt(total('returns'))}</td><td>{fmt(total('paid'))}</td><td>{fmt(total('closing'))}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

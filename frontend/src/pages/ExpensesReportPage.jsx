import { useState, useEffect } from 'react';
import { MdPrint, MdSearch } from 'react-icons/md';
import api from '../api/axios';

export default function ExpensesReportPage() {
  const [expenses, setExpenses] = useState([]);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('');

  const load = () => {
    const params = new URLSearchParams({ from, to });
    if (category) params.set('category', category);
    api.get(`/finance/expenses?${params}`).then(r => setExpenses(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
  const filtered = expenses.filter(e => !category || e.category === category);
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const grouped = filtered.reduce((acc, e) => {
    const cat = e.category || 'أخرى';
    acc[cat] = (acc[cat] || 0) + Number(e.amount);
    return acc;
  }, {});

  const handlePrint = () => {
    const rows = filtered.map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td>${e.category || '—'}</td><td>${Number(e.amount).toLocaleString()}</td></tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>تقرير مصروفات</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:right;font-size:13px}th{background:#f0f0f0}</style></head>
      <body><h2 style="text-align:center">تقرير المصروفات من ${from} إلى ${to}</h2>
      <table><thead><tr><th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>المبلغ</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="font-weight:bold;margin-top:10px">الإجمالي: ${total.toLocaleString()} ج.م</p>
      </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تقرير المصروفات</h1>
        <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="form-label">من تاريخ</label><input type="date" className="erp-input" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="form-label">إلى تاريخ</label><input type="date" className="erp-input" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div>
            <label className="form-label">التصنيف</label>
            <select className="erp-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">الكل</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={load} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSearch size={18} /> عرض</button>
        </div>
      </div>

      {Object.keys(grouped).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(grouped).map(([cat, amt]) => (
            <div key={cat} className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-xs text-gray-500 mb-1">{cat}</div>
              <div className="font-bold text-lg text-primary">{amt.toLocaleString()} <span className="text-xs font-normal text-gray-500">ج.م</span></div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex justify-between">
          <span className="font-bold text-orange-700">إجمالي المصروفات ({filtered.length} بند)</span>
          <span className="font-bold text-orange-700 text-lg">{total.toLocaleString()} ج.م</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>المبلغ</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد بيانات</td></tr>}
            {filtered.map(e => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.description}</td>
                <td><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{e.category || '—'}</span></td>
                <td className="font-bold">{Number(e.amount).toLocaleString()} ج.م</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

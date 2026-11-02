import { useState, useEffect } from 'react';
import { MdPrint } from 'react-icons/md';
import api from '../api/axios';

// Customers who stopped buying but still owe money: no posted invoice for N days (or ever).
export default function SilentCustomersPage() {
  const [days, setDays] = useState(60);
  const [minBalance, setMinBalance] = useState(1);
  const [report, setReport] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api.get('/customers/silent', { params: { days: days || 60, min_balance: minBalance || 1 } })
        .then(r => setReport(r.data)).catch(() => setReport({ rows: [], total: 0 })).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [days, minBalance]);

  const rows = report.rows || [];
  const money = (v) => Number(v).toLocaleString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">عملاء توقفوا عن الشراء وعليهم رصيد</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-end no-print">
        <div>
          <label className="form-label">لم يشتروا منذ (يوم)</label>
          <input type="number" min="1" className="erp-input w-32" value={days} onChange={e => setDays(e.target.value)} />
        </div>
        <div>
          <label className="form-label">رصيدهم لا يقل عن (ج.م)</label>
          <input type="number" min="1" className="erp-input w-40" value={minBalance} onChange={e => setMinBalance(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد العملاء</p><p className="text-lg font-bold">{rows.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المستحق عليهم</p><p className="text-lg font-bold text-danger">{money(report.total || 0)} ج.م</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="erp-table">
          <thead><tr><th>#</th><th>العميل</th><th>الهاتف</th><th>الرصيد</th><th>آخر شراء</th><th>أيام الصمت</th><th>آخر تحصيل</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">{loading ? 'جاري التحميل...' : 'لا يوجد عملاء متوقفون وعليهم رصيد'}</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{r.name}</td>
                <td className="font-mono text-sm">{r.phone}</td>
                <td className="text-danger font-bold">{money(r.balance)} ج.م</td>
                <td>{r.last_purchase || <span className="text-gray-400">لم يشترِ</span>}</td>
                <td>{r.days_silent === null ? <span className="text-gray-400">—</span> : <span className={r.days_silent >= 120 ? 'text-danger font-bold' : 'text-amber-600 font-bold'}>{r.days_silent} يوم</span>}</td>
                <td>{r.last_receipt || <span className="text-gray-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="bg-gray-100 font-bold">
              <td colSpan={3}>الإجمالي</td>
              <td className="text-danger">{money(report.total)} ج.م</td>
              <td colSpan={3}></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

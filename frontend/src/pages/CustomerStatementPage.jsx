import { useState, useEffect } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [movements, setMovements] = useState([]);
  const [dateFrom, setDateFrom] = useState(new Date().getFullYear() + '-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { api.get('/customers').then(r => setCustomers(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!customerId) { setMovements([]); return; }
    api.get(`/customers/${customerId}/statement`).then(r => setMovements(r.data)).catch(() => setMovements([]));
  }, [customerId]);

  const customerName = customers.find(c => c.id === Number(customerId))?.name || '';

  let balance = 0;
  const rows = movements.map(m => {
    balance += m.debit - m.credit;
    return { ...m, balance };
  });

  const handlePrint = () => {
    const printContent = `<html dir="rtl"><head><title>كشف حساب - ${customerName}</title>
    <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:20px;text-align:center}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:6px 8px;text-align:right;font-size:13px}th{background:#f0f0f0}.info{display:flex;justify-content:space-between;margin:15px 0;font-size:14px}</style></head><body>
    <h1>كشف حساب عميل</h1>
    <div class="info"><span>العميل: <strong>${customerName}</strong></span><span>من: ${dateFrom} إلى: ${dateTo}</span></div>
    <table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.date}</td><td>${r.type} ${r.reference}</td><td>${r.debit || ''}</td><td>${r.credit || ''}</td><td>${r.balance.toLocaleString()}</td></tr>`).join('')}</tbody></table>
    </body></html>`;
    const win = window.open('', '_blank'); win.document.write(printContent); win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">كشف حساب عميل</h1>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="form-label">العميل</label>
          <select className="erp-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">— اختر العميل —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">من</label><input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="form-label">إلى</label><input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {customerId && <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!customerId && <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر عميل لعرض كشف الحساب</p></div>}

      {customerId && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="erp-table">
            <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (له)</th><th>دائن (منه)</th><th>الرصيد</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td>{r.type} {r.reference}</td>
                  <td className={r.debit ? 'text-red-600 font-medium' : ''}>{r.debit ? Number(r.debit).toLocaleString() : ''}</td>
                  <td className={r.credit ? 'text-green-600 font-medium' : ''}>{r.credit ? Number(r.credit).toLocaleString() : ''}</td>
                  <td className="font-bold">{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="bg-gray-100 font-bold">
                <td colSpan={2}>الرصيد النهائي</td>
                <td className="text-red-600">{rows.reduce((s, r) => s + Number(r.debit), 0).toLocaleString()}</td>
                <td className="text-green-600">{rows.reduce((s, r) => s + Number(r.credit), 0).toLocaleString()}</td>
                <td className="text-primary text-lg">{rows[rows.length - 1].balance.toLocaleString()} ج.م</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

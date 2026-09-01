import { useState, useEffect } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

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

  const typeColor = (type) => {
    if (type === 'فاتورة بيع') return 'text-red-600';
    if (type === 'مرتجع بيع') return 'text-green-600';
    return 'text-blue-600';
  };

  const handlePrint = () => {
    const printContent = `<html dir="rtl"><head><title>كشف حساب - ${customerName}</title>
    <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:20px;text-align:center}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:6px 8px;text-align:right;font-size:13px}th{background:#f0f0f0}.sub td{background:#f9f9f9;font-size:12px;color:#555}.info{display:flex;justify-content:space-between;margin:15px 0;font-size:14px}</style></head><body>
    <h1>كشف حساب عميل</h1>
    <div class="info"><span>العميل: <strong>${customerName}</strong></span><span>من: ${dateFrom} إلى: ${dateTo}</span></div>
    <table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (له)</th><th>دائن (منه)</th><th>الرصيد</th></tr></thead>
    <tbody>${rows.map(r => `
      <tr><td>${r.date}</td><td>${r.type} ${r.reference}${r.check_due_date ? ` — استحقاق: ${r.check_due_date}` : ''}${r.check_status ? ` (${r.check_status === 'bounced' ? 'مرتد' : r.check_status === 'collected' ? 'تم التحصيل' : 'قيد الانتظار'})` : ''}</td><td>${r.debit ? Number(r.debit).toLocaleString() : ''}</td><td>${r.credit ? Number(r.credit).toLocaleString() : ''}</td><td>${r.balance.toLocaleString()}</td></tr>
      ${r.items?.length ? `<tr class="sub"><td colspan="5"><table style="width:100%;font-size:12px"><thead><tr><th>الصنف</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${r.items.map(it => `<tr><td>${it.Item?.name || ''}</td><td>${Number(it.quantity).toLocaleString()}</td><td>${Number(it.price).toLocaleString()}</td><td>${Number(it.total).toLocaleString()}</td></tr>`).join('')}</tbody></table></td></tr>` : ''}
    `).join('')}</tbody></table>
    </body></html>`;
    const win = window.open('', '_blank'); win.document.write(printContent); win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">كشف حساب عميل</h1>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="form-label">العميل</label>
          <SearchableSelect className="erp-input" value={customerId} onChange={e => { setCustomerId(e.target.value); setExpanded(new Set()); }}>
            <option value="">— اختر العميل —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SearchableSelect>
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
                  <td>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${typeColor(r.type)}`}>{r.type}</span> <span className="font-mono text-sm text-gray-600">{r.reference}</span>
                        {r.check_status && (
                          <span className={`badge text-xs ${r.check_status === 'bounced' ? 'badge-red' : r.check_status === 'collected' ? 'badge-green' : 'badge-yellow'}`}>
                            {r.check_status === 'bounced' ? 'مرتد' : r.check_status === 'collected' ? 'تم التحصيل' : 'قيد الانتظار'}
                          </span>
                        )}
                      </div>
                      {r.check_due_date && (
                        <div className="text-xs text-gray-500">تاريخ الاستحقاق: {r.check_due_date}</div>
                      )}
                      {r.items?.length > 0 && (
                        <div className="text-xs text-gray-500 pr-2 border-r-2 border-blue-200 space-y-0.5 mt-0.5">
                          {r.items.map((it, j) => {
                            const wt = Number(it.weight || 0);
                            const unit = wt > 0 ? `${wt.toLocaleString()} كجم` : `${Number(it.quantity).toLocaleString()} عدد`;
                            const lineTotal = Number(it.total) || (wt > 0 ? wt * Number(it.price || 0) : Number(it.quantity || 0) * Number(it.price || 0));
                            return (
                              <div key={j}>{it.Item?.name || it.item_id} — {unit} × {Number(it.price).toLocaleString()} = <span className="text-gray-700 font-medium">{lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span></div>
                            );
                          })}
                          {(r.discount > 0 || r.tax_amount > 0) && (
                            <div className="flex gap-3 pt-0.5 border-t border-gray-200 flex-wrap">
                              {r.discount > 0 && <span className="text-red-500">خصم: {Number(r.discount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>}
                              {r.tax_amount > 0 && <span className="text-green-600">ضريبة ({r.tax_rate}%): {Number(r.tax_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>}
                              <span className="font-bold text-gray-800">الإجمالي: {Number(r.debit || r.credit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
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
                <td className="text-primary text-lg">{rows[rows.length-1].balance.toLocaleString()} ج.م</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

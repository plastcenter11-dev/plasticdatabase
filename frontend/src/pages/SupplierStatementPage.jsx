import { useState } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';

const mockSuppliers = [
  { id: 1, name: 'شركة البترول للبتروكيماويات' },
  { id: 2, name: 'مصنع الخليج للبلاستيك' },
  { id: 3, name: 'شركة المواد الأولية' },
];

const mockStatements = {
  1: { opening: 0, movements: [
    { date: '2026-06-10', description: 'فاتورة شراء PI-000001', debit: 0, credit: 45600 },
    { date: '2026-06-12', description: 'دفع نقدي CP-000001', debit: 45600, credit: 0 },
  ]},
  2: { opening: 0, movements: [
    { date: '2026-06-18', description: 'فاتورة شراء PI-000002', debit: 0, credit: 15960 },
    { date: '2026-06-17', description: 'دفع نقدي CP-000002', debit: 5000, credit: 0 },
  ]},
  3: { opening: 0, movements: [] },
};

export default function SupplierStatementPage() {
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('2026-06-01');
  const [dateTo, setDateTo] = useState('2026-06-30');

  const statement = supplierId ? mockStatements[supplierId] : null;
  const supplierName = mockSuppliers.find(s => s.id === Number(supplierId))?.name || '';

  let balance = statement?.opening || 0;
  const rows = (statement?.movements || []).map(m => {
    balance += m.credit - m.debit;
    return { ...m, balance };
  });

  const handlePrint = () => {
    const printContent = `
      <html dir="rtl"><head><title>كشف حساب مورد - ${supplierName}</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}
      h1{font-size:20px;text-align:center}table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #333;padding:6px 8px;text-align:right;font-size:13px}th{background:#f0f0f0}
      .info{display:flex;justify-content:space-between;margin:15px 0;font-size:14px}
      </style></head><body>
      <h1>كشف حساب مورد</h1>
      <div class="info"><span>المورد: <strong>${supplierName}</strong></span><span>من: ${dateFrom} إلى: ${dateTo}</span></div>
      <table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (منه)</th><th>دائن (له)</th><th>الرصيد</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.date}</td><td>${r.description}</td><td>${r.debit ? r.debit.toLocaleString() : ''}</td><td>${r.credit ? r.credit.toLocaleString() : ''}</td><td>${r.balance.toLocaleString()}</td></tr>`).join('')}</tbody></table>
      <p style="text-align:left;font-weight:bold;font-size:16px">الرصيد النهائي: ${rows.length ? rows[rows.length - 1].balance.toLocaleString() : 0} ج.م</p>
      </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">كشف حساب مورد</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px]">
          <label className="form-label">المورد</label>
          <select className="erp-input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">— اختر المورد —</option>
            {mockSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="form-label">من</label><input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="form-label">إلى</label><input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {supplierId && <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!supplierId && (
        <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر مورد لعرض كشف الحساب</p></div>
      )}

      {supplierId && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="erp-table">
            <thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (منه)</th><th>دائن (له)</th><th>الرصيد</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td>{r.description}</td>
                  <td className={r.debit ? 'text-green-600 font-medium' : ''}>{r.debit ? r.debit.toLocaleString() : ''}</td>
                  <td className={r.credit ? 'text-red-600 font-medium' : ''}>{r.credit ? r.credit.toLocaleString() : ''}</td>
                  <td className="font-bold">{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="bg-gray-100 font-bold">
                <td colSpan={2}>الرصيد النهائي</td>
                <td className="text-green-600">{rows.reduce((s, r) => s + r.debit, 0).toLocaleString()}</td>
                <td className="text-red-600">{rows.reduce((s, r) => s + r.credit, 0).toLocaleString()}</td>
                <td className="text-primary text-lg">{rows[rows.length - 1].balance.toLocaleString()} ج.م</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

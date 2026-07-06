import { useState, useEffect } from 'react';
import { MdPrint, MdSearch } from 'react-icons/md';
import api from '../api/axios';

export default function CommissionsPage() {
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/employees'), api.get('/sales-invoices')])
      .then(([e, i]) => { setEmployees(e.data); setInvoices(i.data.filter(inv => inv.status === 'posted')); })
      .catch(() => {});
  }, []);

  const handleSearch = () => {
    let filtered = invoices.filter(inv => {
      const d = inv.date;
      return d >= from && d <= to;
    });
    if (selectedEmp) filtered = filtered.filter(inv => inv.employee_id === Number(selectedEmp));
    setRows(filtered);
  };

  const totalSales = rows.reduce((s, r) => s + Number(r.total), 0);
  const totalCommission = rows.reduce((s, r) => {
    const emp = employees.find(e => e.id === r.employee_id);
    return s + (Number(r.total) * (Number(emp?.commission_rate || 0) / 100));
  }, 0);

  const byEmployee = rows.reduce((acc, r) => {
    const emp = employees.find(e => e.id === r.employee_id);
    if (!emp) return acc;
    if (!acc[emp.id]) acc[emp.id] = { name: emp.name, rate: emp.commission_rate, sales: 0, commission: 0 };
    acc[emp.id].sales += Number(r.total);
    acc[emp.id].commission += Number(r.total) * (Number(emp.commission_rate || 0) / 100);
    return acc;
  }, {});

  const handlePrint = () => {
    const empRows = Object.values(byEmployee).map(e =>
      `<tr><td>${e.name}</td><td>${e.rate}%</td><td>${e.sales.toLocaleString()}</td><td>${e.commission.toLocaleString()}</td></tr>`
    ).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>عمولة مندوبين</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:right;font-size:13px}th{background:#f0f0f0}</style></head>
      <body><h2 style="text-align:center">تقرير عمولة المندوبين من ${from} إلى ${to}</h2>
      <table><thead><tr><th>المندوب</th><th>نسبة العمولة</th><th>إجمالي المبيعات</th><th>العمولة المستحقة</th></tr></thead>
      <tbody>${empRows}</tbody></table>
      <p style="font-weight:bold;margin-top:10px">إجمالي العمولات: ${totalCommission.toLocaleString()} ج.م</p>
      </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تقرير عمولة المندوبين</h1>
        <button onClick={handlePrint} disabled={rows.length === 0} className="erp-btn erp-btn-outline flex items-center gap-1 disabled:opacity-50"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="form-label">المندوب</label>
            <select className="erp-input" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
              <option value="">الكل</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className="form-label">من تاريخ</label><input type="date" className="erp-input" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="form-label">إلى تاريخ</label><input type="date" className="erp-input" value={to} onChange={e => setTo(e.target.value)} /></div>
          <button onClick={handleSearch} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSearch size={18} /> عرض</button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4 text-center">
              <div className="text-gray-500 text-sm mb-1">إجمالي المبيعات</div>
              <div className="text-2xl font-bold text-primary">{totalSales.toLocaleString()} ج.م</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 text-center">
              <div className="text-gray-500 text-sm mb-1">إجمالي العمولات</div>
              <div className="text-2xl font-bold text-green-600">{totalCommission.toLocaleString()} ج.م</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b font-bold text-gray-700">ملخص المندوبين</div>
            <table className="erp-table">
              <thead><tr><th>المندوب</th><th>نسبة العمولة</th><th>إجمالي المبيعات</th><th>العمولة المستحقة</th></tr></thead>
              <tbody>
                {Object.values(byEmployee).map((e, i) => (
                  <tr key={i}>
                    <td className="font-medium">{e.name}</td>
                    <td>{e.rate}%</td>
                    <td className="font-bold">{e.sales.toLocaleString()} ج.م</td>
                    <td className="font-bold text-green-700">{e.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b font-bold text-gray-700">تفاصيل الفواتير ({rows.length})</div>
            <table className="erp-table text-sm">
              <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المندوب</th><th>المبلغ</th><th>العمولة</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const emp = employees.find(e => e.id === r.employee_id);
                  const comm = Number(r.total) * (Number(emp?.commission_rate || 0) / 100);
                  return (
                    <tr key={r.id}>
                      <td className="font-mono">{r.invoice_no}</td>
                      <td>{r.date}</td>
                      <td>{emp?.name || '—'}</td>
                      <td className="font-bold">{Number(r.total).toLocaleString()} ج.م</td>
                      <td className="text-green-700 font-bold">{comm.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm flex items-center justify-center h-40 text-gray-400">
          اختر الفترة واضغط عرض
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { MdPrint } from 'react-icons/md';
import api from '../api/axios';

export default function SupplierSummaryPage() {
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => { api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {}); }, []);

  const totalBalance = suppliers.reduce((s, su) => s + Number(su.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تقرير إجمالي موردين</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد الموردين</p><p className="text-lg font-bold">{suppliers.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المستحقات</p><p className="text-lg font-bold text-danger">{totalBalance.toLocaleString()} ج.م</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>المورد</th><th>الهاتف</th><th>المستحق</th><th>الحالة</th></tr></thead>
          <tbody>
            {suppliers.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا يوجد موردين</td></tr>}
            {suppliers.map((s, i) => (
              <tr key={s.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{s.name}</td>
                <td className="font-mono text-sm">{s.phone}</td>
                <td className={Number(s.balance) > 0 ? 'text-danger font-bold' : 'text-success font-bold'}>{Number(s.balance).toLocaleString()} ج.م</td>
                <td>{s.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
              </tr>
            ))}
          </tbody>
          {suppliers.length > 0 && (
            <tfoot><tr className="bg-gray-100 font-bold">
              <td colSpan={3}>الإجمالي</td>
              <td className="text-danger">{totalBalance.toLocaleString()} ج.م</td>
              <td></td>
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

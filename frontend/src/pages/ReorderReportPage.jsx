import { useState, useEffect } from 'react';
import { MdWarning, MdPrint } from 'react-icons/md';
import api from '../api/axios';

export default function ReorderReportPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get('/items/reports/reorder').then(r => setItems(r.data)).catch(() => {});
  }, []);

  const belowReorder = items;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">أصناف تحت حد الطلب</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      {belowReorder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <MdWarning size={24} className="text-red-500" />
          <p className="text-sm text-red-700 font-medium">{belowReorder.length} صنف يحتاج متابعة</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>الرصيد الحالي</th><th>حد الطلب</th></tr></thead>
          <tbody>
            {belowReorder.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا توجد أصناف تحت حد الطلب</td></tr>}
            {belowReorder.map(item => {
              const totalQty = (item.Stocks || []).reduce((s, st) => s + Number(st.quantity), 0);
              return (
                <tr key={item.id} className="bg-red-50">
                  <td className="font-mono text-sm">{item.code}</td>
                  <td className="font-medium">{item.name}</td>
                  <td>{item.unit}</td>
                  <td className="font-bold text-red-600">{totalQty.toLocaleString()}</td>
                  <td>{Number(item.reorder_level).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

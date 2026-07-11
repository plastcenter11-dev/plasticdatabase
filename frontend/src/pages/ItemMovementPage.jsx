import { useState, useEffect } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';

export default function ItemMovementPage() {
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState('');
  const [movements, setMovements] = useState([]);

  useEffect(() => { api.get('/items').then(r => setItems(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!itemId) { setMovements([]); return; }
    api.get(`/stock/movements/${itemId}`).then(r => setMovements(r.data)).catch(() => setMovements([]));
  }, [itemId]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">حركة صنف</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[250px]">
          <label className="form-label">الصنف</label>
          <select className="erp-input" value={itemId} onChange={e => setItemId(e.target.value)}>
            <option value="">— اختر الصنف —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
          </select>
        </div>
        {itemId && <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!itemId && <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر صنف لعرض حركاته</p></div>}

      {itemId && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="erp-table">
            <thead><tr><th>التاريخ</th><th>نوع الحركة</th><th>المرجع</th><th>المخزن</th><th>الوزن</th><th>العدد</th><th>الوصف</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {movements.map((m, i) => (
                <tr key={i}>
                  <td>{m.date}</td>
                  <td><span className="badge badge-blue">{m.movement_type}</span></td>
                  <td className="font-mono text-xs text-gray-500">{m.reference || '-'}</td>
                  <td className="text-sm">{m.Warehouse?.name || '-'}</td>
                  <td className="font-bold">{Number(m.weight).toLocaleString()} كجم</td>
                  <td className="font-bold">{Number(m.quantity).toLocaleString()}</td>
                  <td className="text-sm text-gray-500">{m.description}</td>
                </tr>
              ))}
            </tbody>
            {movements.length > 0 && (() => {
              const totalWeight = movements.reduce((s, m) => s + Number(m.weight || 0), 0);
              const totalQty = movements.reduce((s, m) => s + Number(m.quantity || 0), 0);
              return (
                <tfoot>
                  <tr className="bg-primary/10 font-bold text-primary border-t-2 border-primary/30">
                    <td colSpan={4} className="text-right">الرصيد الإجمالي</td>
                    <td>{totalWeight.toLocaleString()} كجم</td>
                    <td>{totalQty.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}
    </div>
  );
}

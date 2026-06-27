import { useState } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';

const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة' },
  { id: 2, code: 'RM-002', name: 'بولي بروبيلين' },
  { id: 3, code: 'FP-001', name: 'أكياس بلاستيك 30×40' },
  { id: 4, code: 'FP-002', name: 'عبوات PET 500ml' },
];

const mockMovements = {
  1: [
    { date: '2026-06-01', type: 'رصيد افتتاحي', reference: '-', qty_in: 1000, wt_in: 1000, qty_out: 0, wt_out: 0, balance: 1000, wt_balance: 1000, warehouse: 'مخزن الخامات' },
    { date: '2026-06-10', type: 'فاتورة شراء', reference: 'PI-000001', qty_in: 1000, wt_in: 1000, qty_out: 0, wt_out: 0, balance: 2000, wt_balance: 2000, warehouse: 'مخزن الخامات' },
    { date: '2026-06-15', type: 'إضافة', reference: 'ADJ-001', qty_in: 200, wt_in: 200, qty_out: 0, wt_out: 0, balance: 2200, wt_balance: 2200, warehouse: 'مخزن الخامات' },
    { date: '2026-06-19', type: 'فاتورة بيع', reference: 'SI-000001', qty_in: 0, wt_in: 0, qty_out: 500, wt_out: 500, balance: 1700, wt_balance: 1700, warehouse: 'مخزن الخامات' },
    { date: '2026-06-19', type: 'تركيب صنف', reference: 'ASM-001', qty_in: 0, wt_in: 0, qty_out: 50, wt_out: 50, balance: 1650, wt_balance: 1650, warehouse: 'مخزن الخامات' },
  ],
  3: [
    { date: '2026-06-01', type: 'رصيد افتتاحي', reference: '-', qty_in: 5000, wt_in: 250, qty_out: 0, wt_out: 0, balance: 5000, wt_balance: 250, warehouse: 'مخزن المنتجات' },
    { date: '2026-06-18', type: 'تحويل خارج', reference: 'TR-001', qty_in: 0, wt_in: 0, qty_out: 1000, wt_out: 50, balance: 4000, wt_balance: 200, warehouse: 'مخزن المنتجات' },
    { date: '2026-06-19', type: 'تركيب صنف', reference: 'ASM-001', qty_in: 5000, wt_in: 250, qty_out: 0, wt_out: 0, balance: 9000, wt_balance: 450, warehouse: 'مخزن المنتجات' },
  ],
};

export default function ItemMovementPage() {
  const [itemId, setItemId] = useState('');

  const movements = itemId ? (mockMovements[itemId] || []) : [];
  const itemName = mockItems.find(i => i.id === Number(itemId))?.name || '';
  const totalIn = movements.reduce((s, m) => s + m.qty_in, 0);
  const totalOut = movements.reduce((s, m) => s + m.qty_out, 0);
  const totalWtIn = movements.reduce((s, m) => s + m.wt_in, 0);
  const totalWtOut = movements.reduce((s, m) => s + m.wt_out, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">حركة صنف</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[250px]">
          <label className="form-label">الصنف</label>
          <select className="erp-input" value={itemId} onChange={e => setItemId(e.target.value)}>
            <option value="">— اختر الصنف —</option>
            {mockItems.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
          </select>
        </div>
        {itemId && <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!itemId && (
        <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر صنف لعرض حركاته</p></div>
      )}

      {itemId && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card"><p className="text-sm text-gray-500">وارد (وزن)</p><p className="text-lg font-bold text-success">{totalWtIn.toLocaleString()} كجم</p></div>
            <div className="stat-card"><p className="text-sm text-gray-500">وارد (عدد)</p><p className="text-lg font-bold text-success">{totalIn.toLocaleString()}</p></div>
            <div className="stat-card"><p className="text-sm text-gray-500">صادر (وزن)</p><p className="text-lg font-bold text-danger">{totalWtOut.toLocaleString()} كجم</p></div>
            <div className="stat-card"><p className="text-sm text-gray-500">صادر (عدد)</p><p className="text-lg font-bold text-danger">{totalOut.toLocaleString()}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div className="stat-card"><p className="text-sm text-gray-500">رصيد الوزن</p><p className="text-lg font-bold text-primary">{movements.length ? movements[movements.length - 1].wt_balance.toLocaleString() : 0} كجم</p></div>
            <div className="stat-card"><p className="text-sm text-gray-500">رصيد العدد</p><p className="text-lg font-bold text-primary">{movements.length ? movements[movements.length - 1].balance.toLocaleString() : 0}</p></div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="erp-table">
              <thead><tr><th>التاريخ</th><th>نوع الحركة</th><th>المرجع</th><th>المخزن</th><th>وارد (وزن)</th><th>وارد (عدد)</th><th>صادر (وزن)</th><th>صادر (عدد)</th><th>رصيد الوزن</th><th>رصيد العدد</th></tr></thead>
              <tbody>
                {movements.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
                {movements.map((m, i) => (
                  <tr key={i}>
                    <td>{m.date}</td>
                    <td><span className="badge badge-blue">{m.type}</span></td>
                    <td className="font-mono text-xs text-gray-500">{m.reference}</td>
                    <td className="text-sm">{m.warehouse}</td>
                    <td className={m.wt_in ? 'text-success font-medium' : ''}>{m.wt_in || ''}</td>
                    <td className={m.qty_in ? 'text-success font-medium' : ''}>{m.qty_in || ''}</td>
                    <td className={m.wt_out ? 'text-danger font-medium' : ''}>{m.wt_out || ''}</td>
                    <td className={m.qty_out ? 'text-danger font-medium' : ''}>{m.qty_out || ''}</td>
                    <td className="font-bold">{m.wt_balance.toLocaleString()}</td>
                    <td className="font-bold">{m.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

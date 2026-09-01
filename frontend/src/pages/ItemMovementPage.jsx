import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

const INCOMING_TYPES = new Set(['إضافة', 'تحويل داخل', 'فاتورة شراء', 'مرتجع بيع']);
const OUTGOING_TYPES = new Set(['صرف', 'تحويل خارج', 'فاتورة بيع', 'مرتجع شراء']);

// 'تركيب' covers both a component being issued and the assembled item being
// produced, distinguished only by the description text; 'تعديل جرد' sets an
// absolute count rather than a delta, so it defaults to incoming.
const isIncoming = (m) => {
  if (INCOMING_TYPES.has(m.movement_type)) return true;
  if (OUTGOING_TYPES.has(m.movement_type)) return false;
  if (m.movement_type === 'تركيب') return (m.description || '').includes('ناتج');
  return true;
};

export default function ItemMovementPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState(searchParams.get('item_id') || '');
  const [movements, setMovements] = useState([]);

  useEffect(() => { api.get('/items').then(r => setItems(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    const paramId = searchParams.get('item_id');
    if (paramId) setItemId(paramId);
  }, [searchParams]);

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
          <SearchableSelect className="erp-input" value={itemId} onChange={e => setItemId(e.target.value)}>
            <option value="">— اختر الصنف —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
          </SearchableSelect>
        </div>
        {itemId && <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!itemId && <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر صنف لعرض حركاته</p></div>}

      {itemId && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th rowSpan={2}>التاريخ</th>
                <th rowSpan={2}>نوع الحركة</th>
                <th rowSpan={2}>المخزن</th>
                <th colSpan={2} className="text-center text-green-700">الوارد</th>
                <th colSpan={2} className="text-center text-red-700">المنصرف</th>
                <th colSpan={2} className="text-center text-primary">الرصيد</th>
                <th rowSpan={2}>الوصف</th>
              </tr>
              <tr>
                <th className="text-green-700">الوزن</th>
                <th className="text-green-700">العدد</th>
                <th className="text-red-700">الوزن</th>
                <th className="text-red-700">العدد</th>
                <th className="text-primary">الوزن</th>
                <th className="text-primary">العدد</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {(() => {
                let runWeight = 0, runQty = 0;
                return movements.map((m, i) => {
                  const incoming = isIncoming(m);
                  const sign = incoming ? 1 : -1;
                  runWeight += sign * Number(m.weight || 0);
                  runQty += sign * Number(m.quantity || 0);
                  return (
                    <tr key={i}>
                      <td>{m.date}</td>
                      <td><span className="badge badge-blue">{m.movement_type}</span></td>
                      <td className="text-sm">{m.Warehouse?.name || '-'}</td>
                      <td className="font-bold text-green-700">{incoming ? `${Number(m.weight).toLocaleString()} كجم` : '—'}</td>
                      <td className="font-bold text-green-700">{incoming ? Number(m.quantity).toLocaleString() : '—'}</td>
                      <td className="font-bold text-red-700">{!incoming ? `${Number(m.weight).toLocaleString()} كجم` : '—'}</td>
                      <td className="font-bold text-red-700">{!incoming ? Number(m.quantity).toLocaleString() : '—'}</td>
                      <td className="font-bold text-primary">{runWeight.toLocaleString()} كجم</td>
                      <td className="font-bold text-primary">{runQty.toLocaleString()}</td>
                      <td className="text-sm text-gray-500">
                        {m.description}
                        {m.assembly_item_name && <span className="text-gray-400"> ({m.assembly_item_name})</span>}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
            {movements.length > 0 && (() => {
              const inWeight = movements.filter(isIncoming).reduce((s, m) => s + Number(m.weight || 0), 0);
              const inQty = movements.filter(isIncoming).reduce((s, m) => s + Number(m.quantity || 0), 0);
              const outWeight = movements.filter(m => !isIncoming(m)).reduce((s, m) => s + Number(m.weight || 0), 0);
              const outQty = movements.filter(m => !isIncoming(m)).reduce((s, m) => s + Number(m.quantity || 0), 0);
              return (
                <tfoot>
                  <tr className="bg-primary/10 font-bold text-primary border-t-2 border-primary/30">
                    <td colSpan={3} className="text-right">الإجمالي</td>
                    <td className="text-green-700">{inWeight.toLocaleString()} كجم</td>
                    <td className="text-green-700">{inQty.toLocaleString()}</td>
                    <td className="text-red-700">{outWeight.toLocaleString()} كجم</td>
                    <td className="text-red-700">{outQty.toLocaleString()}</td>
                    <td colSpan={2}>{(inWeight - outWeight).toLocaleString()} كجم / {(inQty - outQty).toLocaleString()}</td>
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

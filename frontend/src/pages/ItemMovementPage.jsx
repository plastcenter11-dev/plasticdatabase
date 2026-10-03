import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';
import { HEADER_SELECT } from '../utils/tableUi';

const INCOMING_TYPES = new Set(['إضافة', 'تحويل داخل', 'فاتورة شراء', 'مرتجع بيع']);
const OUTGOING_TYPES = new Set(['صرف', 'تحويل خارج', 'فاتورة بيع', 'مرتجع شراء']);

// 'تركيب' covers both a component being issued and the assembled item being
// produced, distinguished only by the description text; 'تعديل جرد' sets an
// absolute count rather than a delta, so it defaults to incoming. A component
// line recorded with a negative weight/quantity (e.g. surplus material
// returned) is an addition in substance, so it's shown with the incoming
// rows instead of as a negative number sitting in the outgoing column.
const isIncoming = (m) => {
  if (INCOMING_TYPES.has(m.movement_type)) return true;
  if (OUTGOING_TYPES.has(m.movement_type)) return false;
  if (m.movement_type === 'تركيب') {
    if ((m.description || '').includes('ناتج')) return true;
    return Number(m.weight || 0) < 0 || Number(m.quantity || 0) < 0;
  }
  return true;
};

export default function ItemMovementPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [itemId, setItemId] = useState(searchParams.get('item_id') || '');
  const [warehouseId, setWarehouseId] = useState('');
  const [movements, setMovements] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    api.get('/items').then(r => setItems(r.data)).catch(() => {});
    api.get('/warehouses').then(r => setWarehouses(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const paramId = searchParams.get('item_id');
    if (paramId) setItemId(paramId);
  }, [searchParams]);

  useEffect(() => {
    if (!itemId) { setMovements([]); return; }
    api.get(`/stock/movements/${itemId}`).then(r => setMovements(r.data)).catch(() => setMovements([]));
  }, [itemId]);

  // Filtering to one warehouse recomputes the running balance from just that
  // warehouse's own movements, rather than the item's combined balance
  // across every warehouse.
  const filteredMovements = warehouseId ? movements.filter(m => m.warehouse_id === Number(warehouseId)) : movements;

  // The running balance is computed over every movement (of the chosen
  // warehouse), then the date range / type filters only pick which rows are
  // shown, so a filtered row still carries its true balance. With a start date
  // the balance carried in from before it is shown as its own row.
  const allRows = filteredMovements.reduce((acc, m) => {
    const prev = acc[acc.length - 1];
    const incoming = isIncoming(m);
    const sign = incoming ? 1 : -1;
    const weight = Math.abs(Number(m.weight || 0));
    const qty = Math.abs(Number(m.quantity || 0));
    acc.push({ m, incoming, weight, qty, runWeight: (prev ? prev.runWeight : 0) + sign * weight, runQty: (prev ? prev.runQty : 0) + sign * qty });
    return acc;
  }, []);
  const typeOptions = [...new Set(allRows.map(r => r.m.movement_type))];
  // If the chosen type doesn't exist for the newly selected item, ignore it.
  const activeType = typeOptions.includes(typeFilter) ? typeFilter : '';
  const rows = allRows.filter(r => (!dateFrom || r.m.date >= dateFrom) && (!dateTo || r.m.date <= dateTo) && (!activeType || r.m.movement_type === activeType));
  const before = dateFrom ? allRows.filter(r => r.m.date < dateFrom) : [];
  const opening = before.length ? before[before.length - 1] : null;
  const isFiltered = !!(dateFrom || dateTo || activeType);
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setTypeFilter(''); };

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
        <div className="min-w-[200px]">
          <label className="form-label">المخزن</label>
          <SearchableSelect className="erp-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            <option value="">— كل المخازن —</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </SearchableSelect>
        </div>
        <div>
          <label className="form-label">من تاريخ</label>
          <input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label">إلى تاريخ</label>
          <input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {isFiltered && <button onClick={clearFilters} className="erp-btn erp-btn-outline">مسح الفلاتر</button>}
        {itemId && <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
      </div>

      {!itemId && <div className="text-center py-16 text-gray-400"><MdSearch size={48} className="mx-auto mb-2 opacity-50" /><p>اختر صنف لعرض حركاته</p></div>}

      {itemId && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th rowSpan={2}>التاريخ</th>
                <th rowSpan={2}>
                  <SearchableSelect className={`${HEADER_SELECT} min-w-[120px]`} value={activeType} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">نوع الحركة</option>
                    {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </SearchableSelect>
                </th>
                <th rowSpan={2}>المخزن</th>
                <th rowSpan={2}>السعر</th>
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
              {rows.length === 0 && !opening && <tr><td colSpan={11} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {dateFrom && (
                <tr className="bg-gray-50 text-gray-600 font-semibold">
                  <td colSpan={8}>رصيد سابق (قبل {dateFrom})</td>
                  <td className="font-bold text-primary">{(opening ? opening.runWeight : 0).toLocaleString()} كجم</td>
                  <td className="font-bold text-primary">{(opening ? opening.runQty : 0).toLocaleString()}</td>
                  <td></td>
                </tr>
              )}
              {rows.map(({ m, incoming, weight, qty, runWeight, runQty }, i) => (
                <tr key={i}>
                  <td>{m.date}</td>
                  <td><span className="badge badge-blue">{m.movement_type}</span></td>
                  <td className="text-sm">{m.Warehouse?.name || '-'}</td>
                  <td className="text-sm">{Number(m.unit_price || 0) ? Number(m.unit_price).toLocaleString() : '—'}</td>
                  <td className="font-bold text-green-700">{incoming ? `${weight.toLocaleString()} كجم` : '—'}</td>
                  <td className="font-bold text-green-700">{incoming ? qty.toLocaleString() : '—'}</td>
                  <td className="font-bold text-red-700">{!incoming ? `${weight.toLocaleString()} كجم` : '—'}</td>
                  <td className="font-bold text-red-700">{!incoming ? qty.toLocaleString() : '—'}</td>
                  <td className="font-bold text-primary">{runWeight.toLocaleString()} كجم</td>
                  <td className="font-bold text-primary">{runQty.toLocaleString()}</td>
                  <td className="text-sm text-gray-500">
                    {m.description}
                    {m.assembly_item_name && <span className="text-gray-400"> ({m.assembly_item_name})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (() => {
              const inWeight = rows.filter(r => r.incoming).reduce((s, r) => s + r.weight, 0);
              const inQty = rows.filter(r => r.incoming).reduce((s, r) => s + r.qty, 0);
              const outWeight = rows.filter(r => !r.incoming).reduce((s, r) => s + r.weight, 0);
              const outQty = rows.filter(r => !r.incoming).reduce((s, r) => s + r.qty, 0);
              const last = rows[rows.length - 1];
              return (
                <tfoot>
                  <tr className="bg-primary/10 font-bold text-primary border-t-2 border-primary/30">
                    <td colSpan={4} className="text-right">الإجمالي{isFiltered ? ' (المعروض)' : ''}</td>
                    <td className="text-green-700">{inWeight.toLocaleString()} كجم</td>
                    <td className="text-green-700">{inQty.toLocaleString()}</td>
                    <td className="text-red-700">{outWeight.toLocaleString()} كجم</td>
                    <td className="text-red-700">{outQty.toLocaleString()}</td>
                    <td colSpan={2}>{last.runWeight.toLocaleString()} كجم / {last.runQty.toLocaleString()}</td>
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

import { useState, useEffect } from 'react';
import { MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';

export default function WarehouseItemsPage() {
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [typeFilters, setTypeFilters] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/stock/items-stock').then(r => setItems(r.data)).catch(() => {});
    api.get('/warehouses').then(r => setWarehouses(r.data)).catch(() => {});
  }, []);

  const categories = [...new Set(items.map(i => i.category_name).filter(Boolean))].sort();
  const types = [...new Set(items.map(i => i.type_name).filter(Boolean))].sort();

  const filtered = items.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.item_name?.toLowerCase().includes(q) && !item.item_code?.toLowerCase().includes(q)) return false;
    }
    if (categoryFilters.length > 0 && !categoryFilters.includes(item.category_name)) return false;
    if (typeFilters.length > 0 && !typeFilters.includes(item.type_name)) return false;
    return true;
  });

  // For display: if a specific warehouse is selected, show one row per item with that
  // warehouse's qty. Otherwise, items stocked in more than one warehouse are split into
  // one row per warehouse (stacked under the same item) so each balance is visible on
  // its own; items in a single warehouse (or none) stay as a single row.
  let displayRows;
  if (warehouseFilter) {
    displayRows = filtered.map(item => {
      const wh = item.warehouses.find(w => w.warehouse_id === Number(warehouseFilter));
      return { ...item, qty: wh ? wh.quantity : 0, weight: wh ? wh.weight : 0, warehouseName: null, isFirst: true, rowSpan: 1, key: String(item.item_id) };
    });
  } else {
    displayRows = [];
    filtered.forEach(item => {
      if (item.warehouses.length > 1) {
        item.warehouses.forEach((w, idx) => {
          displayRows.push({
            ...item, qty: w.quantity, weight: w.weight, warehouseName: w.warehouse_name,
            isFirst: idx === 0, rowSpan: idx === 0 ? item.warehouses.length : 0,
            key: `${item.item_id}-${w.warehouse_id}`,
          });
        });
      } else {
        displayRows.push({
          ...item, qty: item.total_quantity, weight: item.total_weight,
          warehouseName: item.warehouses[0]?.warehouse_name || '—',
          isFirst: true, rowSpan: 1, key: String(item.item_id),
        });
      }
    });
  }
  const itemCount = filtered.length;

  const getValue = (item) => Number(item.weight || 0) * Number(item.purchase_price || 0);

  const handlePrint = () => {
    const whName = warehouses.find(w => w.id === Number(warehouseFilter))?.name || 'كل المخازن';
    const totalValue = displayRows.reduce((s, r) => s + getValue(r), 0);
    const rows = displayRows.map(item => `<tr>
      <td>${item.isFirst ? (item.item_code || '') : ''}</td>
      <td>${item.isFirst ? (item.item_name || '') : ''}</td>
      <td>${item.isFirst ? (item.category_name || '') : ''}</td>
      <td>${item.warehouseName || ''}</td>
      <td>${Number(item.qty).toLocaleString()}</td>
      <td>${Number(item.weight).toLocaleString()}</td>
      <td>${item.unit || ''}</td>
      <td>${Number(item.purchase_price || 0).toLocaleString()}</td>
      <td>${getValue(item).toLocaleString()}</td>
    </tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>مخزن الأصناف</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:20px;text-align:center;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border:1px solid #333;padding:6px 8px;text-align:right;font-size:13px}th{background:#f0f0f0}
      .info{text-align:center;color:#555;margin-bottom:15px;font-size:13px}
      tfoot td{font-weight:bold;background:#f0f0f0}</style></head>
      <body><h1>مخزن الأصناف</h1><div class="info">المخزن: ${whName}</div>
      <table><thead><tr><th>الكود</th><th>الصنف</th><th>القسم</th><th>المخزن</th><th>العدد</th><th>الوزن (كجم)</th><th>الوحدة</th><th>سعر التكلفة</th><th>القيمة الإجمالية</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="7">الإجمالي</td><td>${totalValue.toLocaleString()} ج.م</td></tr></tfoot>
      </table></body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">مخزن الأصناف</h1>
        <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1">
          <MdPrint size={18} /> طباعة
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select className="erp-input w-auto min-w-[150px]" value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}>
          <option value="">كل المخازن</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
          <input className="erp-input pr-10" placeholder="بحث باسم الصنف أو الكود..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 font-medium shrink-0">القسم:</span>
          {categories.map(c => {
            const active = categoryFilters.includes(c);
            return (
              <button key={c} type="button"
                onClick={() => setCategoryFilters(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                className={`px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer ${active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'}`}>
                {c}
              </button>
            );
          })}
          {categoryFilters.length > 0 && (
            <button type="button" onClick={() => setCategoryFilters([])} className="text-xs text-gray-400 hover:text-red-500 underline cursor-pointer">مسح</button>
          )}
        </div>
      )}

      {types.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 font-medium shrink-0">النوع:</span>
          {types.map(t => {
            const active = typeFilters.includes(t);
            return (
              <button key={t} type="button"
                onClick={() => setTypeFilters(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                className={`px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer ${active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'}`}>
                {t}
              </button>
            );
          })}
          {typeFilters.length > 0 && (
            <button type="button" onClick={() => setTypeFilters([])} className="text-xs text-gray-400 hover:text-red-500 underline cursor-pointer">مسح</button>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الصنف</th>
              <th>القسم</th>
              {!warehouseFilter && <th>المخزن</th>}
              <th>العدد</th>
              <th>الوزن (كجم)</th>
              <th>الوحدة</th>
              <th>سعر الشراء</th>
              <th>سعر البيع</th>
              <th>القيمة الإجمالية</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr><td colSpan={warehouseFilter ? 9 : 10} className="text-center py-10 text-gray-400">لا توجد بيانات</td></tr>
            )}
            {displayRows.map((item) => (
              <tr key={item.key} className={item.qty < 0 ? 'bg-red-50' : ''}>
                {item.isFirst && <td className="font-mono text-sm text-gray-500" rowSpan={item.rowSpan}>{item.item_code}</td>}
                {item.isFirst && <td className="font-medium" rowSpan={item.rowSpan}>{item.item_name}</td>}
                {item.isFirst && <td className="text-sm text-gray-500" rowSpan={item.rowSpan}>{item.category_name || '—'}</td>}
                {!warehouseFilter && (
                  <td className="text-xs text-gray-400">{item.warehouseName || '—'}</td>
                )}
                <td className={`font-bold ${item.qty < 0 ? 'text-red-600' : item.qty === 0 ? 'text-gray-400' : ''}`}>
                  {Number(item.qty).toLocaleString()}
                </td>
                <td className={item.weight < 0 ? 'text-red-600' : ''}>
                  {Number(item.weight).toLocaleString()}
                </td>
                <td className="text-gray-500">{item.unit}</td>
                <td className="text-gray-600">{Number(item.purchase_price || 0).toLocaleString()} ج.م</td>
                <td className="text-gray-600">{Number(item.sale_price || 0) > 0 ? Number(item.sale_price).toLocaleString() + ' ج.م' : '—'}</td>
                <td className="font-bold text-primary">{getValue(item) > 0 ? getValue(item).toLocaleString() + ' ج.م' : '—'}</td>
              </tr>
            ))}
          </tbody>
          {displayRows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={warehouseFilter ? 3 : 4}>الإجمالي ({itemCount} صنف)</td>
                <td>{displayRows.reduce((s, r) => s + Number(r.qty), 0).toLocaleString()}</td>
                <td>{displayRows.reduce((s, r) => s + Number(r.weight), 0).toLocaleString()}</td>
                <td></td>
                <td></td>
                <td className="text-primary">{displayRows.reduce((s, r) => s + getValue(r), 0).toLocaleString()} ج.م</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

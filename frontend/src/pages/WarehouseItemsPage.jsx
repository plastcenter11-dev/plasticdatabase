import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdSearch, MdPrint, MdBarChart, MdViewColumn } from 'react-icons/md';
import api from '../api/axios';
import SearchableSelect from '../components/SearchableSelect';

const COLUMNS = [
  { key: 'code', label: 'الكود' },
  { key: 'name', label: 'الصنف' },
  { key: 'category', label: 'القسم' },
  { key: 'warehouse', label: 'المخزن' },
  { key: 'qty', label: 'العدد' },
  { key: 'weight', label: 'الوزن (كجم)' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'purchase_price', label: 'سعر الشراء' },
  { key: 'sale_price', label: 'سعر البيع' },
  { key: 'value', label: 'القيمة الإجمالية' },
];
const VISIBLE_COLS_KEY = 'warehouseItems.visibleCols';

function loadVisibleCols() {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIBLE_COLS_KEY));
    if (saved && typeof saved === 'object') return { ...Object.fromEntries(COLUMNS.map(c => [c.key, true])), ...saved };
  } catch { /* ignore */ }
  return Object.fromEntries(COLUMNS.map(c => [c.key, true]));
}

export default function WarehouseItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [typeFilters, setTypeFilters] = useState([]);
  const [search, setSearch] = useState('');
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(visibleCols)); } catch { /* ignore */ }
  }, [visibleCols]);

  useEffect(() => {
    if (!showColMenu) return;
    const onClick = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showColMenu]);

  const toggleCol = (key) => setVisibleCols(v => ({ ...v, [key]: !v[key] }));
  const isVisible = (key) => key === 'warehouse' ? (!warehouseFilter && visibleCols.warehouse) : visibleCols[key];
  const visibleCount = COLUMNS.filter(c => isVisible(c.key)).length + 1; // +1 for the actions column

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

  const printCols = COLUMNS.filter(c => isVisible(c.key) && c.key !== 'sale_price');
  const printCellFor = (item, key) => {
    switch (key) {
      case 'code': return item.isFirst ? (item.item_code || '') : '';
      case 'name': return item.isFirst ? (item.item_name || '') : '';
      case 'category': return item.isFirst ? (item.category_name || '') : '';
      case 'warehouse': return item.warehouseName || '';
      case 'qty': return Number(item.qty).toLocaleString();
      case 'weight': return Number(item.weight).toLocaleString();
      case 'unit': return item.unit || '';
      case 'purchase_price': return Number(item.purchase_price || 0).toLocaleString();
      case 'value': return getValue(item).toLocaleString();
      default: return '';
    }
  };

  const handlePrint = () => {
    const whName = warehouses.find(w => w.id === Number(warehouseFilter))?.name || 'كل المخازن';
    const totalValue = displayRows.reduce((s, r) => s + getValue(r), 0);
    const valueColIdx = printCols.findIndex(c => c.key === 'value');
    const rows = displayRows.map(item => `<tr>${printCols.map(c => `<td>${printCellFor(item, c.key)}</td>`).join('')}</tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>مخزن الأصناف</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:20px;text-align:center;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border:1px solid #333;padding:6px 8px;text-align:right;font-size:13px}th{background:#f0f0f0}
      .info{text-align:center;color:#555;margin-bottom:15px;font-size:13px}
      tfoot td{font-weight:bold;background:#f0f0f0}</style></head>
      <body><h1>مخزن الأصناف</h1><div class="info">المخزن: ${whName}</div>
      <table><thead><tr>${printCols.map(c => `<th>${c.key === 'purchase_price' ? 'سعر التكلفة' : c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>${printCols.map((c, i) => i === valueColIdx ? `<td>${totalValue.toLocaleString()} ج.م</td>` : i === 0 ? `<td colspan="${valueColIdx >= 0 ? valueColIdx : printCols.length}">الإجمالي</td>` : (i < valueColIdx ? '' : `<td></td>`)).join('')}</tr></tfoot>
      </table></body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">مخزن الأصناف</h1>
        <div className="flex gap-2 relative" ref={colMenuRef}>
          <button onClick={() => setShowColMenu(v => !v)} className="erp-btn erp-btn-outline flex items-center gap-1">
            <MdViewColumn size={18} /> الأعمدة
          </button>
          {showColMenu && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 min-w-[180px] space-y-1">
              {COLUMNS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input type="checkbox" checked={visibleCols[c.key]} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
          <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1">
            <MdPrint size={18} /> طباعة
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <SearchableSelect className="erp-input w-auto min-w-[150px]" value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}>
          <option value="">كل المخازن</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </SearchableSelect>
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
              {COLUMNS.filter(c => isVisible(c.key)).map(c => <th key={c.key}>{c.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr><td colSpan={visibleCount} className="text-center py-10 text-gray-400">لا توجد بيانات</td></tr>
            )}
            {displayRows.map((item) => (
              <tr key={item.key} className={item.qty < 0 ? 'bg-red-50' : ''}>
                {isVisible('code') && item.isFirst && <td className="font-mono text-sm text-gray-500" rowSpan={item.rowSpan}>{item.item_code}</td>}
                {isVisible('name') && item.isFirst && <td className="font-medium" rowSpan={item.rowSpan}>{item.item_name}</td>}
                {isVisible('category') && item.isFirst && <td className="text-sm text-gray-500" rowSpan={item.rowSpan}>{item.category_name || '—'}</td>}
                {isVisible('warehouse') && (
                  <td className="text-xs text-gray-400">{item.warehouseName || '—'}</td>
                )}
                {isVisible('qty') && (
                  <td className={`font-bold ${item.qty < 0 ? 'text-red-600' : item.qty === 0 ? 'text-gray-400' : ''}`}>
                    {Number(item.qty).toLocaleString()}
                  </td>
                )}
                {isVisible('weight') && (
                  <td className={item.weight < 0 ? 'text-red-600' : ''}>
                    {Number(item.weight).toLocaleString()}
                  </td>
                )}
                {isVisible('unit') && <td className="text-gray-500">{item.unit}</td>}
                {isVisible('purchase_price') && <td className="text-gray-600">{Number(item.purchase_price || 0).toLocaleString()} ج.م</td>}
                {isVisible('sale_price') && <td className="text-gray-600">{Number(item.sale_price || 0) > 0 ? Number(item.sale_price).toLocaleString() + ' ج.م' : '—'}</td>}
                {isVisible('value') && <td className="font-bold text-primary">{getValue(item) > 0 ? getValue(item).toLocaleString() + ' ج.م' : '—'}</td>}
                {item.isFirst && (
                  <td rowSpan={item.rowSpan}>
                    <button
                      type="button"
                      title="حركة الصنف"
                      onClick={() => navigate(`/reports/item-movement?item_id=${item.item_id}`)}
                      className="erp-btn erp-btn-outline py-1 px-2 text-xs flex items-center gap-1 whitespace-nowrap"
                    >
                      <MdBarChart size={14} /> حركة الصنف
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {displayRows.length > 0 && (() => {
            const leadCols = ['code', 'name', 'category', 'warehouse'].filter(isVisible);
            const numericLeadCols = ['qty', 'weight'].filter(isVisible);
            const trailingCols = ['unit', 'purchase_price', 'sale_price'].filter(isVisible);
            return (
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  {leadCols.length > 0 && <td colSpan={leadCols.length}>الإجمالي ({itemCount} صنف)</td>}
                  {numericLeadCols.includes('qty') && <td>{displayRows.reduce((s, r) => s + Number(r.qty), 0).toLocaleString()}</td>}
                  {numericLeadCols.includes('weight') && <td>{displayRows.reduce((s, r) => s + Number(r.weight), 0).toLocaleString()}</td>}
                  {trailingCols.map(k => <td key={k}></td>)}
                  {isVisible('value') && <td className="text-primary">{displayRows.reduce((s, r) => s + getValue(r), 0).toLocaleString()} ج.م</td>}
                  <td></td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
    </div>
  );
}

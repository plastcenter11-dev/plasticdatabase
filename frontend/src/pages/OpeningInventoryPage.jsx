import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdSave, MdWarning } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function OpeningInventoryPage() {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/items'), api.get('/warehouses')]).then(([it, wh]) => {
      setItems(it.data.filter(i => i.is_stockable));
      setWarehouses(wh.data);
      if (wh.data.length) setWarehouseId(String(wh.data[0].id));
    }).catch(() => {});
  }, []);

  // When warehouse changes, load current stock into rows
  useEffect(() => {
    if (!warehouseId || items.length === 0) return;
    api.get('/stock/items-stock').then(r => {
      const stockMap = {};
      r.data.forEach(s => {
        const wh = s.warehouses.find(w => w.warehouse_id === Number(warehouseId));
        stockMap[s.item_id] = { qty: wh ? wh.quantity : 0, weight: wh ? wh.weight : 0 };
      });
      setRows(items.map(item => ({
        item_id: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        quantity: stockMap[item.id]?.qty ?? 0,
        weight: stockMap[item.id]?.weight ?? 0,
        cost_price: item.purchase_price || 0,
      })));
    }).catch(() => {});
  }, [warehouseId, items.length]);

  const updateRow = (idx, field, val) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: val } : row));
  };

  const handleSave = async () => {
    if (!warehouseId) return toast.error('اختر المخزن');
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    let successCount = 0, errorCount = 0;
    for (const row of rows) {
      try {
        await api.post('/stock/adjustments', {
          item_id: row.item_id,
          warehouse_id: Number(warehouseId),
          quantity: Number(row.quantity),
          weight: Number(row.weight || 0),
          unit_price: Number(row.cost_price || 0),
          movement_type: 'تعديل جرد',
          date: today,
          description: 'جرد أول المدة',
        });
        successCount++;
      } catch { errorCount++; }
    }
    setSaving(false);
    if (errorCount === 0) toast.success(`تم حفظ جرد ${successCount} صنف بنجاح`);
    else toast.warning(`تم حفظ ${successCount} صنف، فشل ${errorCount}`);
  };

  const totalValue = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.cost_price || 0), 0);
  const nonZeroCount = rows.filter(r => Number(r.quantity) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">جرد أول المدة</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدخال الأرصدة الافتتاحية للمخزون عند بدء النظام</p>
        </div>
        {can('stock', 'create') && (
          <button onClick={handleSave} disabled={saving || rows.length === 0} className="erp-btn erp-btn-primary flex items-center gap-2 disabled:opacity-50">
            <MdSave size={20} />{saving ? 'جاري الحفظ...' : 'حفظ الجرد'}
          </button>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <MdWarning size={22} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>تنبيه:</strong> هذه الصفحة تستخدم <strong>تعديل جرد</strong> — كل حفظ يضبط العدد الحالية على القيمة المُدخلة. استخدمها مرة واحدة عند بدء النظام أو عند إجراء جرد فعلي.
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="form-label">المخزن</label>
          <select className="erp-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {rows.length > 0 && (
          <div className="flex gap-4 mr-auto text-sm text-gray-600">
            <span>أصناف بها رصيد: <strong className="text-primary">{nonZeroCount}</strong></span>
            <span>إجمالي قيمة المخزون: <strong className="text-primary">{totalValue.toLocaleString()} ج.م</strong></span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الصنف</th>
              <th>الوحدة</th>
              <th>العدد</th>
              <th>الوزن (كجم)</th>
              <th>سعر التكلفة</th>
              <th>القيمة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">اختر مخزن لتحميل الأصناف</td></tr>
            )}
            {rows.map((row, idx) => {
              const val = Number(row.quantity || 0) * Number(row.cost_price || 0);
              return (
                <tr key={row.item_id} className={Number(row.quantity) > 0 ? 'bg-green-50/30' : ''}>
                  <td className="font-mono text-xs text-gray-400">{row.code}</td>
                  <td className="font-medium text-sm">{row.name}</td>
                  <td className="text-gray-500 text-sm">{row.unit}</td>
                  <td>
                    <input
                      type="number" min="0" step="0.001"
                      className="erp-input py-1 w-28 text-sm"
                      value={row.quantity}
                      onChange={e => updateRow(idx, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="0.001"
                      className="erp-input py-1 w-28 text-sm"
                      value={row.weight}
                      onChange={e => updateRow(idx, 'weight', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min="0" step="0.01"
                      className="erp-input py-1 w-28 text-sm"
                      value={row.cost_price}
                      onChange={e => updateRow(idx, 'cost_price', e.target.value)}
                    />
                  </td>
                  <td className={`font-bold text-sm ${val > 0 ? 'text-primary' : 'text-gray-300'}`}>
                    {val > 0 ? val.toLocaleString() + ' ج.م' : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={6} className="text-left">الإجمالي</td>
                <td className="text-primary">{totalValue.toLocaleString()} ج.م</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

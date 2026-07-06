import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdWarning, MdPrint, MdShoppingCart, MdCheck } from 'react-icons/md';
import api from '../api/axios';

export default function ReorderOrderPage() {
  const [stockData, setStockData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState({});
  const [supplierId, setSupplierId] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/stock/items-stock'),
      api.get('/suppliers'),
      api.get('/warehouses'),
    ]).then(([s, sup, w]) => {
      setStockData(s.data);
      setSuppliers(sup.data);
      setWarehouses(w.data);
      if (w.data.length) setWarehouse(String(w.data[0].id));
    }).catch(() => {});
  }, []);

  const belowReorder = stockData.filter(i =>
    Number(i.reorder_level) > 0 && Number(i.total_quantity) < Number(i.reorder_level)
  );

  const toggleSelect = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectAll = () => {
    const all = {};
    belowReorder.forEach(i => { all[i.item_id] = true; });
    setSelected(all);
  };
  const clearAll = () => setSelected({});

  const selectedItems = belowReorder.filter(i => selected[i.item_id]);
  const shortage = (item) => Math.max(0, Number(item.reorder_level) - Number(item.total_quantity));

  const createPurchaseOrder = async () => {
    if (!supplierId) return toast.error('اختر المورد أولاً');
    if (!warehouse) return toast.error('اختر المخزن');
    if (selectedItems.length === 0) return toast.error('اختر أصناف أولاً');
    setCreating(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const items = selectedItems.map(i => ({
        item_id: i.item_id,
        quantity: shortage(i),
        price: Number(i.purchase_price || 0),
        total: shortage(i) * Number(i.purchase_price || 0),
      }));
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      await api.post('/purchase-invoices', {
        supplier_id: Number(supplierId),
        warehouse_id: Number(warehouse),
        date: today,
        status: 'draft',
        subtotal,
        discount: 0,
        tax_rate: 0,
        tax_amount: 0,
        total: subtotal,
        items,
      });
      toast.success(`تم إنشاء طلب شراء بـ ${selectedItems.length} صنف`);
      clearAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'خطأ في إنشاء الطلب');
    } finally { setCreating(false); }
  };

  const handlePrint = () => {
    const rows = belowReorder.map(i => `<tr>
      <td>${i.item_code}</td><td>${i.item_name}</td><td>${i.unit}</td>
      <td>${Number(i.total_quantity).toLocaleString()}</td>
      <td>${Number(i.reorder_level).toLocaleString()}</td>
      <td style="color:red;font-weight:bold">${shortage(i).toLocaleString()}</td>
    </tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>أمر حد الطلب</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:right;font-size:13px}th{background:#f0f0f0}</style></head>
      <body><h2 style="text-align:center">أمر حد الطلب</h2>
      <p style="text-align:center">تاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
      <table><thead><tr><th>الكود</th><th>الصنف</th><th>الوحدة</th><th>الرصيد الحالي</th><th>حد الطلب</th><th>الاحتياج</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close(); win.print();
  };

  const allSelected = belowReorder.length > 0 && belowReorder.every(i => selected[i.item_id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">أمر حد الطلب</h1>
        <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      {belowReorder.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <MdWarning size={24} className="text-red-500 shrink-0" />
          <span className="text-red-700 font-bold">{belowReorder.length} صنف تحت حد الطلب</span>
        </div>
      )}

      {belowReorder.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="form-label">المورد لطلب الشراء</label>
              <select className="erp-input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">— اختر مورد —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">المخزن</label>
              <select className="erp-input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={allSelected ? clearAll : selectAll} className="erp-btn erp-btn-outline text-sm">
                {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
              </button>
              <button
                onClick={createPurchaseOrder}
                disabled={creating || selectedItems.length === 0}
                className="erp-btn erp-btn-primary flex items-center gap-1 disabled:opacity-50"
              >
                <MdShoppingCart size={18} />
                {creating ? 'جاري الإنشاء...' : `إنشاء طلب شراء (${selectedItems.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th>الكود</th><th>الصنف</th><th>الوحدة</th>
              <th>الرصيد الحالي</th><th>حد الطلب</th><th>الاحتياج</th>
            </tr>
          </thead>
          <tbody>
            {belowReorder.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-green-500 font-medium">
                <MdCheck size={20} className="inline ml-1" />كل الأصناف فوق حد الطلب
              </td></tr>
            )}
            {belowReorder.map(item => {
              const sh = shortage(item);
              const pct = Number(item.reorder_level) > 0
                ? Math.round((Number(item.total_quantity) / Number(item.reorder_level)) * 100)
                : 100;
              return (
                <tr key={item.item_id} className={selected[item.item_id] ? 'bg-primary/5' : ''}>
                  <td>
                    <input type="checkbox" checked={!!selected[item.item_id]} onChange={() => toggleSelect(item.item_id)} className="w-4 h-4 accent-primary" />
                  </td>
                  <td className="font-mono text-sm">{item.item_code}</td>
                  <td className="font-medium">{item.item_name}</td>
                  <td className="text-gray-500">{item.unit}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${pct < 30 ? 'bg-red-500' : pct < 70 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className={`font-bold ${Number(item.total_quantity) === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                        {Number(item.total_quantity).toLocaleString()}
                      </span>
                    </div>
                  </td>
                  <td>{Number(item.reorder_level).toLocaleString()}</td>
                  <td>
                    <span className="badge badge-red text-base font-bold px-2 py-0.5">{sh.toLocaleString()}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

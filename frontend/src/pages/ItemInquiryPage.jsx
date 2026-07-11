import { useState, useEffect } from 'react';
import { MdSearch } from 'react-icons/md';
import api from '../api/axios';

export default function ItemInquiryPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [itemData, setItemData] = useState(null);
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { api.get('/items').then(r => setItems(r.data)).catch(() => {}); }, []);

  const filtered = items.filter(i => !search || i.name?.includes(search) || i.code?.includes(search));

  const handleSelect = async (id) => {
    setSelectedId(id);
    if (!id) { setItemData(null); setStock([]); setMovements([]); return; }
    try {
      const [stockR, movR] = await Promise.all([
        api.get('/stock/items-stock'),
        api.get(`/stock/movements/${id}`),
      ]);
      const item = items.find(i => i.id === Number(id));
      setItemData(item);
      const s = stockR.data.find(r => r.item_id === Number(id));
      setStock(s ? s.warehouses : []);
      setMovements(movR.data.slice(-20).reverse());
    } catch { }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">استعلام عن صنف</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: item list */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={18} />
              <input className="erp-input pr-9 text-sm" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {filtered.map(i => (
              <button key={i.id} onClick={() => handleSelect(i.id)}
                className={`w-full text-right px-4 py-2 text-sm border-b hover:bg-gray-50 ${selectedId === i.id ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-gray-400">{i.code}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: details */}
        <div className="md:col-span-2 space-y-4">
          {!itemData && (
            <div className="bg-white rounded-xl shadow-sm flex items-center justify-center h-48 text-gray-400">
              <div className="text-center"><MdSearch size={40} className="mx-auto mb-2 opacity-30" /><p>اختر صنف من القائمة</p></div>
            </div>
          )}

          {itemData && (<>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="font-bold text-gray-800 mb-3">{itemData.name}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500 text-xs mb-1">الكود</div><div className="font-bold font-mono">{itemData.code}</div></div>
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500 text-xs mb-1">الوحدة</div><div className="font-bold">{itemData.unit}</div></div>
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500 text-xs mb-1">سعر الشراء</div><div className="font-bold">{Number(itemData.purchase_price || 0).toLocaleString()} ج.م</div></div>
                <div className="bg-gray-50 rounded-lg p-3"><div className="text-gray-500 text-xs mb-1">حد الطلب</div><div className="font-bold">{itemData.reorder_level || 0}</div></div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-gray-700">الرصيد في المخازن</div>
              {stock.length === 0
                ? <div className="p-4 text-center text-gray-400 text-sm">لا يوجد مخزون مسجّل</div>
                : <table className="erp-table">
                    <thead><tr><th>المخزن</th><th>العدد</th><th>الوزن (كجم)</th></tr></thead>
                    <tbody>
                      {stock.map((s, i) => (
                        <tr key={i}>
                          <td>{s.warehouse_name}</td>
                          <td className="font-bold">{Number(s.quantity).toLocaleString()}</td>
                          <td>{Number(s.weight).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-gray-700">آخر 20 حركة</div>
              {movements.length === 0
                ? <div className="p-4 text-center text-gray-400 text-sm">لا توجد حركات</div>
                : <table className="erp-table text-sm">
                    <thead><tr><th>التاريخ</th><th>النوع</th><th>المخزن</th><th>العدد</th><th>البيان</th></tr></thead>
                    <tbody>
                      {movements.map((m, i) => (
                        <tr key={i}>
                          <td>{m.date}</td>
                          <td><span className={`badge ${m.movement_type === 'إضافة' || m.movement_type === 'فاتورة شراء' ? 'badge-green' : 'badge-red'}`}>{m.movement_type}</span></td>
                          <td>{m.Warehouse?.name}</td>
                          <td className="font-bold">{Number(m.quantity).toLocaleString()}</td>
                          <td className="text-gray-500">{m.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

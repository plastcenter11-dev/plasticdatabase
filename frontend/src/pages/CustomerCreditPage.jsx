import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdEdit, MdSave, MdSearch } from 'react-icons/md';
import api from '../api/axios';

export default function CustomerCreditPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');

  const load = () => api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c => !search || c.name?.includes(search));

  const handleSave = async (id) => {
    try {
      await api.put(`/customers/${id}`, { credit_limit: Number(editVal) });
      toast.success('تم تحديث حد الائتمان');
      setEditingId(null);
      load();
    } catch { toast.error('خطأ في الحفظ'); }
  };

  const statusColor = (balance, limit) => {
    if (!limit) return '';
    const pct = balance / limit;
    if (pct >= 1) return 'text-red-600 font-bold';
    if (pct >= 0.8) return 'text-orange-500 font-bold';
    return 'text-green-600';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">حدود الائتمان العملاء</h1>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث باسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="erp-table">
          <thead><tr><th>العميل</th><th>الرصيد الحالي</th><th>حد الائتمان</th><th>المتاح</th><th>النسبة</th><th>تعديل</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا يوجد عملاء</td></tr>}
            {filtered.map(c => {
              const limit = Number(c.credit_limit || 0);
              const bal = Number(c.balance || 0);
              const available = limit ? limit - bal : null;
              const pct = limit ? Math.min(100, Math.round((bal / limit) * 100)) : null;
              return (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="font-bold">{bal.toLocaleString()} ج.م</td>
                  <td>
                    {editingId === c.id
                      ? <input type="number" className="erp-input py-1 w-28" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
                      : <span>{limit ? limit.toLocaleString() + ' ج.م' : <span className="text-gray-400">غير محدد</span>}</span>
                    }
                  </td>
                  <td className={available !== null ? statusColor(bal, limit) : 'text-gray-400'}>
                    {available !== null ? available.toLocaleString() + ' ج.م' : '—'}
                  </td>
                  <td>
                    {pct !== null
                      ? <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs">{pct}%</span>
                        </div>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td>
                    {editingId === c.id
                      ? <button onClick={() => handleSave(c.id)} className="erp-btn erp-btn-primary py-1 px-2 text-xs flex items-center gap-1"><MdSave size={14} /> حفظ</button>
                      : <button onClick={() => { setEditingId(c.id); setEditVal(c.credit_limit || ''); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    }
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

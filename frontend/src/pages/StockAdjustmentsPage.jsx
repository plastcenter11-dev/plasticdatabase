import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdEdit, MdSearch } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { movement_type: 'إضافة', warehouse_id: '', item_id: '', quantity: '', weight: '', unit_price: '', date: new Date().toISOString().split('T')[0], description: '' };

export default function StockAdjustmentsPage() {
  const location = useLocation();
  const defaultType = location.pathname === '/stock-issue' ? 'صرف' : location.pathname === '/stock-receive' ? 'إضافة' : 'إضافة';
  const pageTitle = location.pathname === '/stock-issue' ? 'صرف من المخزن' : location.pathname === '/stock-receive' ? 'إضافة للمخزن' : 'تسوية المخزون (جرد / صرف / إضافة)';

  const [adjustments, setAdjustments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, movement_type: defaultType });

  const loadData = async () => {
    try {
      const [adj, wh, it] = await Promise.all([api.get('/stock/adjustments'), api.get('/warehouses'), api.get('/items')]);
      setAdjustments(adj.data); setWarehouses(wh.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = adjustments.filter(a => {
    const matchSearch = !search || a.Item?.name?.includes(search) || a.description?.includes(search);
    const matchType = !filterType || a.movement_type === filterType;
    return matchSearch && matchType;
  });

  const typeBadge = (t) => {
    if (t === 'إضافة') return <span className="badge badge-green">إضافة</span>;
    if (t === 'صرف') return <span className="badge badge-red">صرف</span>;
    return <span className="badge badge-blue">تعديل جرد</span>;
  };

  const openEdit = (a) => {
    setEditing(a.id);
    setForm({ movement_type: a.movement_type, warehouse_id: String(a.warehouse_id), item_id: String(a.item_id), quantity: a.quantity, weight: a.weight, unit_price: a.unit_price, date: a.date, description: a.description || '' });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.warehouse_id || !form.item_id || !form.weight) return toast.error('أكمل البيانات');
    const data = { ...form, item_id: Number(form.item_id), warehouse_id: Number(form.warehouse_id), quantity: Number(form.quantity || 0), weight: Number(form.weight), unit_price: Number(form.unit_price || 0) };
    try {
      if (editing) {
        await api.put(`/stock/adjustments/${editing}`, data);
        toast.success('تم التعديل بنجاح');
      } else {
        await api.post('/stock/adjustments', data);
        toast.success(`تم تسجيل ${form.movement_type}`);
      }
      setShowModal(false); setEditing(null); setForm({ ...emptyForm, movement_type: defaultType }); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذه الحركة؟')) return;
    try { await api.delete(`/stock/adjustments/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">{pageTitle}</h1>
        <button onClick={() => { setEditing(null); setForm({ ...emptyForm, movement_type: defaultType }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> حركة جديدة</button>
      </div>

      <div className="page-card">
        <div className="flex gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث بالصنف أو الوصف..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="erp-input w-auto min-w-[130px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">كل الأنواع</option>
            <option value="إضافة">إضافة</option>
            <option value="صرف">صرف</option>
            <option value="تعديل جرد">تعديل جرد</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="erp-table">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>المخزن</th><th>الصنف</th><th>الوزن (كجم)</th><th>العدد</th><th>سعر الوحدة</th><th>الوصف</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا توجد حركات</td></tr>}
              {filtered.map(a => (
                <tr key={a.id}>
                  <td>{a.date}</td>
                  <td>{typeBadge(a.movement_type)}</td>
                  <td className="text-sm">{a.Warehouse?.name || '-'}</td>
                  <td className="font-medium">{a.Item?.name || '-'}</td>
                  <td className="font-bold">{Number(a.weight).toLocaleString()} كجم</td>
                  <td className="font-bold">{Number(a.quantity).toLocaleString()}</td>
                  <td>{Number(a.unit_price).toLocaleString()}</td>
                  <td className="text-sm text-gray-500">{a.description}</td>
                  <td className="flex gap-1">
                    <button onClick={() => openEdit(a)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(a.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل حركة مخزون' : 'حركة مخزون جديدة'} onClose={() => { setShowModal(false); setEditing(null); }} width="max-w-lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">نوع الحركة *</label>
                <select className="erp-input" value={form.movement_type} onChange={e => setForm({ ...form, movement_type: e.target.value })}>
                  <option value="إضافة">إضافة للمخزن</option>
                  <option value="صرف">صرف من المخزن</option>
                  <option value="تعديل جرد">تعديل جرد</option>
                </select>
              </div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">المخزن *</label>
                <select className="erp-input" required value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">الصنف *</label>
                <select className="erp-input" required value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">الوزن (كجم) *</label><input type="number" step="0.01" className="erp-input" required value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} /></div>
              <div><label className="form-label">العدد</label><input type="number" className="erp-input" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><label className="form-label">سعر الوحدة</label><input type="number" step="0.01" className="erp-input" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></div>
            </div>
            <div><label className="form-label">الوصف</label><input className="erp-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

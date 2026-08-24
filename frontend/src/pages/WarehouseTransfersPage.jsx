import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdCheckCircle } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function WarehouseTransfersPage() {
  const { can } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ from_warehouse_id: '', to_warehouse_id: '', date: new Date().toISOString().split('T')[0], items: [{ item_id: '', quantity: '', weight: '' }] });

  const loadData = async () => {
    try {
      const [t, w, it] = await Promise.all([api.get('/stock/transfers'), api.get('/warehouses'), api.get('/items')]);
      setTransfers(t.data); setWarehouses(w.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const updateFormItem = (idx, field, value) => {
    const fitems = [...form.items];
    fitems[idx] = { ...fitems[idx], [field]: value };
    setForm({ ...form, items: fitems });
  };
  const addFormItem = () => setForm({ ...form, items: [...form.items, { item_id: '', quantity: '', weight: '' }] });
  const removeFormItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.from_warehouse_id || !form.to_warehouse_id) return toast.error('اختر المخازن');
    if (form.from_warehouse_id === form.to_warehouse_id) return toast.error('لا يمكن التحويل لنفس المخزن');
    try {
      await api.post('/stock/transfers', { ...form, from_warehouse_id: Number(form.from_warehouse_id), to_warehouse_id: Number(form.to_warehouse_id), items: form.items.map(i => ({ item_id: Number(i.item_id), quantity: Number(i.quantity), weight: Number(i.weight || 0) })) });
      toast.success('تم إنشاء أمر التحويل');
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleConfirm = async (id) => {
    try { await api.post(`/stock/transfers/${id}/confirm`); toast.success('تم تأكيد التحويل'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تحويلات مخازن</h1>
        {can('stock', 'create') && <button onClick={() => { setForm({ from_warehouse_id: '', to_warehouse_id: '', date: new Date().toISOString().split('T')[0], items: [{ item_id: '', quantity: '', weight: '' }] }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> تحويل جديد</button>}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>التاريخ</th><th>من مخزن</th><th>إلى مخزن</th><th>الأصناف</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {transfers.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد تحويلات</td></tr>}
            {transfers.map(t => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td className="font-medium">{t.fromWarehouse?.name || '-'}</td>
                <td className="font-medium">{t.toWarehouse?.name || '-'}</td>
                <td>{(t.items || []).map((item, i) => <div key={i} className="text-sm">{item.Item?.name || '-'} — وزن: {Number(item.weight).toLocaleString()} كجم | عدد: {Number(item.quantity).toLocaleString()}</div>)}</td>
                <td>{t.status === 'pending' ? <span className="badge badge-yellow">قيد التنفيذ</span> : <span className="badge badge-green">تم</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {t.status === 'pending' && can('stock', 'edit') && <button onClick={() => handleConfirm(t.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1"><MdCheckCircle size={14} /> تأكيد</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="تحويل مخزن جديد" onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">من مخزن *</label><SearchableSelect className="erp-input" required value={form.from_warehouse_id} onChange={e => setForm({ ...form, from_warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</SearchableSelect></div>
              <div><label className="form-label">إلى مخزن *</label><SearchableSelect className="erp-input" required value={form.to_warehouse_id} onChange={e => setForm({ ...form, to_warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</SearchableSelect></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="form-label mb-0">الأصناف</label><button type="button" onClick={addFormItem} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button></div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الوزن (كجم)</th><th>العدد</th><th></th></tr></thead>
                <tbody>{form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td><SearchableSelect className="erp-input py-1" value={item.item_id} onChange={e => updateFormItem(idx, 'item_id', e.target.value)}><option value="">اختر صنف</option>{items.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}</SearchableSelect></td>
                    <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={item.weight} onChange={e => updateFormItem(idx, 'weight', e.target.value)} /></td>
                    <td><input type="number" className="erp-input py-1 w-24" value={item.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)} /></td>
                    <td>{form.items.length > 1 && <button type="button" onClick={() => removeFormItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
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

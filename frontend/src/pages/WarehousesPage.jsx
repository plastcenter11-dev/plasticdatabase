import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { name: '', location: '' };

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setWarehouses((await api.get('/warehouses')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/warehouses/${editing.id}`, form); toast.success('تم التحديث'); }
      else { await api.post('/warehouses', form); toast.success('تمت الإضافة'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا المخزن؟')) return;
    try { await api.delete(`/warehouses/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">تعريف مخزن</h1>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة مخزن</button>
      </div>
      <div className="page-card">
        <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="erp-table">
          <thead><tr><th>#</th><th>اسم المخزن</th><th>الموقع</th><th>إجراءات</th></tr></thead>
          <tbody>
            {warehouses.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد مخازن</td></tr>}
            {warehouses.map((w, i) => (
              <tr key={w.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{w.name}</td>
                <td className="text-sm text-gray-500">{w.location || '-'}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(w); setForm({ name: w.name, location: w.location || '' }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(w.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {showModal && (
        <Modal title={editing ? 'تعديل مخزن' : 'إضافة مخزن'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">اسم المخزن *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="form-label">الموقع</label><input className="erp-input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
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

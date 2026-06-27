import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';

const initialWarehouses = [
  { id: 1, name: 'مخزن الخامات', location: 'المصنع - القسم أ', items_count: 12 },
  { id: 2, name: 'مخزن المنتجات التامة', location: 'المصنع - القسم ب', items_count: 25 },
  { id: 3, name: 'مخزن مستلزمات التشغيل', location: 'المصنع - القسم ج', items_count: 8 },
  { id: 4, name: 'مخزن البضاعة الجاهزة للشحن', location: 'المستودع الخارجي', items_count: 15 },
];

const emptyForm = { name: '', location: '' };

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (wh) => { setEditing(wh); setForm({ name: wh.name, location: wh.location }); setShowModal(true); };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing) {
      setWarehouses(warehouses.map(w => w.id === editing.id ? { ...w, ...form } : w));
      toast.success('تم تحديث المخزن');
    } else {
      setWarehouses([...warehouses, { ...form, id: Date.now(), items_count: 0 }]);
      toast.success('تمت إضافة المخزن');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المخزن؟')) return;
    setWarehouses(warehouses.filter(w => w.id !== id));
    toast.success('تم حذف المخزن');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تعريف مخزن</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1">
          <MdAdd size={20} /> إضافة مخزن
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>اسم المخزن</th><th>الموقع</th><th>عدد الأصناف</th><th>إجراءات</th></tr></thead>
          <tbody>
            {warehouses.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">لا توجد مخازن</td></tr>}
            {warehouses.map((wh, i) => (
              <tr key={wh.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{wh.name}</td>
                <td className="text-gray-600">{wh.location}</td>
                <td><span className="badge badge-blue">{wh.items_count}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(wh)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(wh.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل مخزن' : 'إضافة مخزن'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">اسم المخزن *</label>
              <input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="form-label">الموقع</label>
              <input className="erp-input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
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

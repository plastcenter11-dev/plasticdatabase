import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { name: '', phone: '', address: '', is_active: true };

export default function SuppliersPage() {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setSuppliers((await api.get('/suppliers')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = suppliers.filter(s => !search || s.name.includes(search) || (s.phone || '').includes(search));

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/suppliers/${editing.id}`, form); toast.success('تم تحديث المورد'); }
      else { await api.post('/suppliers', form); toast.success('تمت إضافة المورد'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    try { await api.delete(`/suppliers/${id}`); toast.success('تم حذف المورد'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const totalBalance = suppliers.reduce((sum, s) => sum + Number(s.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تعريف موردين</h1>
        {can('suppliers', 'create') && <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة مورد</button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد الموردين</p><p className="text-lg font-bold">{suppliers.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المستحقات</p><p className="text-lg font-bold text-danger">{totalBalance.toLocaleString()} ج.م</p></div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>اسم المورد</th><th>الهاتف</th><th>العنوان</th><th>الرصيد</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا يوجد موردين</td></tr>}
            {filtered.map((s, i) => (
              <tr key={s.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{s.name}</td>
                <td className="font-mono text-sm">{s.phone}</td>
                <td className="text-gray-600 text-sm">{s.address}</td>
                <td className={Number(s.balance) > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{Number(s.balance).toLocaleString()} ج.م</td>
                <td>{s.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {can('suppliers', 'edit') && <button onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', is_active: s.is_active }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    {can('suppliers', 'delete') && <button onClick={() => handleDelete(s.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل مورد' : 'إضافة مورد'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">اسم المورد *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الهاتف</label><input className="erp-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="form-label">العنوان</label><input className="erp-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sup_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <label htmlFor="sup_active" className="text-sm text-gray-700">مورد نشط</label>
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

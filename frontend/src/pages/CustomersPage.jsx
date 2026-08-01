import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { name: '', phone: '', address: '', credit_limit: '', is_active: true };

export default function CustomersPage() {
  const { can } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setCustomers((await api.get('/customers')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = customers.filter(c => !search || c.name.includes(search) || (c.phone || '').includes(search));

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || '', address: c.address || '', credit_limit: c.credit_limit, is_active: c.is_active });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, credit_limit: Number(form.credit_limit || 0) };
      if (editing) { await api.put(`/customers/${editing.id}`, payload); toast.success('تم تحديث العميل'); }
      else { await api.post('/customers', payload); toast.success('تمت إضافة العميل'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    try { await api.delete(`/customers/${id}`); toast.success('تم حذف العميل'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const totalBalance = customers.reduce((sum, c) => sum + Number(c.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تعريف عملاء</h1>
        {can('customers', 'create') && <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة عميل</button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد العملاء</p><p className="text-lg font-bold">{customers.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي الأرصدة</p><p className="text-lg font-bold text-primary">{totalBalance.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">نشط / غير نشط</p><p className="text-lg font-bold">{customers.filter(c => c.is_active).length} / {customers.filter(c => !c.is_active).length}</p></div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>اسم العميل</th><th>الهاتف</th><th>العنوان</th><th>الرصيد</th><th>حد الائتمان</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا يوجد عملاء</td></tr>}
            {filtered.map((c, i) => (
              <tr key={c.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{c.name}</td>
                <td className="font-mono text-sm">{c.phone}</td>
                <td className="text-gray-600 text-sm">{c.address}</td>
                <td className={Number(c.balance) > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{Number(c.balance).toLocaleString()} ج.م</td>
                <td>{Number(c.credit_limit).toLocaleString()} ج.م</td>
                <td>{c.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {can('customers', 'edit') && <button onClick={() => openEdit(c)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    {can('customers', 'delete') && <button onClick={() => handleDelete(c.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل عميل' : 'إضافة عميل'} onClose={() => setShowModal(false)} width="max-w-lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">اسم العميل *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الهاتف</label><input className="erp-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="form-label">حد الائتمان</label><input type="number" className="erp-input" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></div>
            </div>
            <div><label className="form-label">العنوان</label><input className="erp-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <label htmlFor="is_active" className="text-sm text-gray-700">عميل نشط</label>
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

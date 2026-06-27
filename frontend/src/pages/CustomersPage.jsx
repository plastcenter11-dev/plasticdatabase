import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';

const initialCustomers = [
  { id: 1, name: 'شركة النيل للتغليف', phone: '01012345678', address: 'القاهرة - المنطقة الصناعية', balance: 15200, credit_limit: 50000, is_active: true },
  { id: 2, name: 'مصنع الأمل للبلاستيك', phone: '01198765432', address: 'الإسكندرية - برج العرب', balance: 8500, credit_limit: 30000, is_active: true },
  { id: 3, name: 'توزيعات المحروسة', phone: '01234567890', address: 'الجيزة - 6 أكتوبر', balance: 22000, credit_limit: 40000, is_active: true },
  { id: 4, name: 'شركة البركة التجارية', phone: '01556789012', address: 'المنصورة', balance: 0, credit_limit: 20000, is_active: false },
];

const emptyForm = { name: '', phone: '', address: '', credit_limit: '', is_active: true };

export default function CustomersPage() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = customers.filter(c => !search || c.name.includes(search) || c.phone.includes(search));

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, address: c.address, credit_limit: c.credit_limit, is_active: c.is_active });
    setShowModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing) {
      setCustomers(customers.map(c => c.id === editing.id ? { ...c, ...form, credit_limit: Number(form.credit_limit) } : c));
      toast.success('تم تحديث العميل');
    } else {
      setCustomers([...customers, { ...form, id: Date.now(), credit_limit: Number(form.credit_limit), balance: 0 }]);
      toast.success('تمت إضافة العميل');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    setCustomers(customers.filter(c => c.id !== id));
    toast.success('تم حذف العميل');
  };

  const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تعريف عملاء</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1">
          <MdAdd size={20} /> إضافة عميل
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-sm text-gray-500">عدد العملاء</p>
          <p className="text-lg font-bold">{customers.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gray-500">إجمالي الأرصدة</p>
          <p className="text-lg font-bold text-primary">{totalBalance.toLocaleString()} ج.م</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gray-500">نشط / غير نشط</p>
          <p className="text-lg font-bold">{customers.filter(c => c.is_active).length} / {customers.filter(c => !c.is_active).length}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث بالاسم أو الهاتف..."
          value={search} onChange={e => setSearch(e.target.value)} />
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
                <td className={c.balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{c.balance.toLocaleString()} ج.م</td>
                <td>{c.credit_limit.toLocaleString()} ج.م</td>
                <td>{c.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(c.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
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
            <div>
              <label className="form-label">اسم العميل *</label>
              <input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">الهاتف</label>
                <input className="erp-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="form-label">حد الائتمان</label>
                <input type="number" className="erp-input" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="form-label">العنوان</label>
              <input className="erp-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
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

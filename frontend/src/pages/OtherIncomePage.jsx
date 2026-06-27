import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';

const categories = ['إيرادات متنوعة', 'بيع مخلفات', 'إيجار', 'أخرى'];

const initialIncome = [
  { id: 1, date: '2026-06-08', description: 'بيع مخلفات بلاستيك', amount: 3500, category: 'بيع مخلفات' },
  { id: 2, date: '2026-06-14', description: 'إيجار جزء من المخزن', amount: 2000, category: 'إيجار' },
];

const emptyForm = { date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'أخرى' };

export default function OtherIncomePage() {
  const [income, setIncome] = useState(initialIncome);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const filtered = income.filter(i => !search || i.description.includes(search));
  const totalIncome = filtered.reduce((s, i) => s + i.amount, 0);

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) return toast.error('أكمل البيانات');
    setIncome([{ id: Date.now(), ...form, amount: Number(form.amount) }, ...income]);
    toast.success('تم تسجيل الإيراد');
    setShowModal(false);
    setForm(emptyForm);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا الإيراد؟')) return;
    setIncome(income.filter(i => i.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">إيرادات أخرى</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إيراد جديد</button>
      </div>

      <div className="stat-card max-w-xs">
        <p className="text-sm text-gray-500">إجمالي الإيرادات</p>
        <p className="text-xl font-bold text-success">{totalIncome.toLocaleString()} ج.م</p>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>المبلغ</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد إيرادات</td></tr>}
            {filtered.map((inc, i) => (
              <tr key={inc.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td>{inc.date}</td>
                <td className="font-medium">{inc.description}</td>
                <td><span className="badge badge-green">{inc.category}</span></td>
                <td className="font-bold text-success">{inc.amount.toLocaleString()} ج.م</td>
                <td><button onClick={() => handleDelete(inc.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="إيراد جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">الوصف *</label><input className="erp-input" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <label className="form-label">التصنيف</label>
              <select className="erp-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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

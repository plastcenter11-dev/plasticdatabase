import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';

const expenseCategories = ['إيجار', 'كهرباء ومياه', 'رواتب', 'صيانة', 'مواصلات', 'مستلزمات مكتبية', 'أخرى'];
const emptyForm = { date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'أخرى' };

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setExpenses((await api.get('/finance/expenses')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = expenses.filter(e => {
    const matchSearch = !search || e.description.includes(search);
    const matchCat = !filterCat || e.category === filterCat;
    return matchSearch && matchCat;
  });

  const totalExpenses = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) return toast.error('أكمل البيانات');
    try {
      await api.post('/finance/expenses', { ...form, amount: Number(form.amount) });
      toast.success('تم تسجيل المصروف');
      setShowModal(false); setForm(emptyForm); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا المصروف؟')) return;
    try { await api.delete(`/finance/expenses/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">مصروفات</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مصروف جديد</button>
      </div>

      <div className="stat-card max-w-xs">
        <p className="text-sm text-gray-500">إجمالي المصروفات (معروض)</p>
        <p className="text-xl font-bold text-danger">{totalExpenses.toLocaleString()} ج.م</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
          <input className="erp-input pr-10" placeholder="بحث بالوصف..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="erp-input w-auto min-w-[130px]" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">كل التصنيفات</option>
          {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>المبلغ</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد مصروفات</td></tr>}
            {filtered.map((e, i) => (
              <tr key={e.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td>{e.date}</td>
                <td className="font-medium">{e.description}</td>
                <td><span className="badge badge-yellow">{e.category}</span></td>
                <td className="font-bold text-danger">{Number(e.amount).toLocaleString()} ج.م</td>
                <td><button onClick={() => handleDelete(e.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="مصروف جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">الوصف *</label><input className="erp-input" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <label className="form-label">التصنيف</label>
              <select className="erp-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
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

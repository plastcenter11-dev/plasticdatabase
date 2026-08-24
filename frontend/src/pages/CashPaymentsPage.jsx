import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { supplier_id: '', amount: '', payment_method: 'نقدي', date: new Date().toISOString().split('T')[0], notes: '' };

export default function CashPaymentsPage() {
  const { can } = useAuth();
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [p, s] = await Promise.all([api.get('/finance/cash-payments'), api.get('/suppliers')]);
      setPayments(p.data); setSuppliers(s.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = payments.filter(p => {
    if (!search) return true;
    return p.payment_no?.includes(search) || p.Supplier?.name?.includes(search);
  });

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.supplier_id || !form.amount) return toast.error('أكمل البيانات');
    try {
      await api.post('/finance/cash-payments', { ...form, supplier_id: Number(form.supplier_id), amount: Number(form.amount) });
      toast.success('تم تسجيل الدفع');
      setShowModal(false); setForm(emptyForm); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الدفع؟')) return;
    try { await api.delete(`/finance/cash-payments/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">حركات دفع نقدية</h1>
        {can('cash_payments', 'create') && <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> دفع جديد</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد المدفوعات</p><p className="text-lg font-bold">{payments.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المدفوعات</p><p className="text-lg font-bold text-danger">{totalAmount.toLocaleString()} ج.م</p></div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>رقم الإيصال</th><th>التاريخ</th><th>المورد</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد مدفوعات</td></tr>}
            {filtered.map(p => (
              <tr key={p.id}>
                <td className="font-mono text-sm">{p.payment_no}</td>
                <td>{p.date}</td>
                <td className="font-medium">{p.Supplier?.name || '-'}</td>
                <td className="font-bold text-danger">{Number(p.amount).toLocaleString()} ج.م</td>
                <td><span className="badge badge-blue">{p.payment_method}</span></td>
                <td className="text-sm text-gray-500">{p.notes}</td>
                <td>{can('cash_payments', 'delete') && <button onClick={() => handleDelete(p.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="دفع نقدي جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">المورد *</label>
              <SearchableSelect className="erp-input" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">— اختر —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SearchableSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <label className="form-label">طريقة الدفع</label>
              <select className="erp-input" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                <option value="نقدي">نقدي</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
                <option value="شيك">شيك</option>
              </select>
            </div>
            <div><label className="form-label">ملاحظات</label><input className="erp-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
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

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { party_type: 'customer', party_id: '', debit: '', credit: '' };

export default function OpeningBalancesPage() {
  const [balances, setBalances] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [b, c, s, fy] = await Promise.all([api.get('/opening-balances'), api.get('/customers'), api.get('/suppliers'), api.get('/financial-years')]);
      setBalances(b.data); setCustomers(c.data); setSuppliers(s.data); setFinancialYears(fy.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = balances.filter(b => !filterType || b.party_type === filterType);
  const parties = form.party_type === 'customer' ? customers : suppliers;
  const activeYear = financialYears.find(y => y.is_active);

  const getPartyName = (b) => {
    if (b.party_type === 'customer') return customers.find(c => c.id === b.party_id)?.name || '-';
    return suppliers.find(s => s.id === b.party_id)?.name || '-';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.party_id || (!form.debit && !form.credit)) return toast.error('أكمل البيانات');
    try {
      await api.post('/opening-balances', { ...form, party_id: Number(form.party_id), debit: Number(form.debit || 0), credit: Number(form.credit || 0), financial_year_id: activeYear?.id });
      toast.success('تم تسجيل الرصيد الافتتاحي');
      setShowModal(false); setForm(emptyForm); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الرصيد؟')) return;
    try { await api.delete(`/opening-balances/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">الأرصدة الافتتاحية</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> رصيد جديد</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        الأرصدة الافتتاحية تُسجَّل عند بداية استخدام النظام أو عند تقفيل السنة المالية.
      </div>

      <select className="erp-input w-auto min-w-[150px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
        <option value="">الكل</option>
        <option value="customer">عملاء</option>
        <option value="supplier">موردين</option>
      </select>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>النوع</th><th>الاسم</th><th>مدين</th><th>دائن</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد أرصدة افتتاحية</td></tr>}
            {filtered.map((b, i) => (
              <tr key={b.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td>{b.party_type === 'customer' ? <span className="badge badge-blue">عميل</span> : <span className="badge badge-yellow">مورد</span>}</td>
                <td className="font-medium">{getPartyName(b)}</td>
                <td className="text-red-600 font-bold">{Number(b.debit) ? Number(b.debit).toLocaleString() + ' ج.م' : '-'}</td>
                <td className="text-green-600 font-bold">{Number(b.credit) ? Number(b.credit).toLocaleString() + ' ج.م' : '-'}</td>
                <td><button onClick={() => handleDelete(b.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="رصيد افتتاحي جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">النوع</label>
              <select className="erp-input" value={form.party_type} onChange={e => setForm({ ...form, party_type: e.target.value, party_id: '' })}>
                <option value="customer">عميل</option>
                <option value="supplier">مورد</option>
              </select>
            </div>
            <div>
              <label className="form-label">{form.party_type === 'customer' ? 'العميل' : 'المورد'} *</label>
              <select className="erp-input" required value={form.party_id} onChange={e => setForm({ ...form, party_id: e.target.value })}>
                <option value="">— اختر —</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">مدين</label><input type="number" className="erp-input" value={form.debit} onChange={e => setForm({ ...form, debit: e.target.value })} /></div>
              <div><label className="form-label">دائن</label><input type="number" className="erp-input" value={form.credit} onChange={e => setForm({ ...form, credit: e.target.value })} /></div>
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

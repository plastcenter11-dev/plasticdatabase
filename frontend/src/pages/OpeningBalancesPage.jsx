import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف' },
  { id: 2, name: 'مصنع الأمل للبلاستيك' },
  { id: 3, name: 'توزيعات المحروسة' },
];
const mockSuppliers = [
  { id: 1, name: 'شركة البترول للبتروكيماويات' },
  { id: 2, name: 'مصنع الخليج للبلاستيك' },
];

const initialBalances = [
  { id: 1, party_type: 'customer', party_id: 3, party_name: 'توزيعات المحروسة', financial_year: '2025-2026', opening_balance: 5000, type: 'مدين' },
  { id: 2, party_type: 'supplier', party_id: 2, party_name: 'مصنع الخليج للبلاستيك', financial_year: '2025-2026', opening_balance: 3000, type: 'دائن' },
];

const emptyForm = { party_type: 'customer', party_id: '', opening_balance: '', type: 'مدين' };

export default function OpeningBalancesPage() {
  const [balances, setBalances] = useState(initialBalances);
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const filtered = balances.filter(b => !filterType || b.party_type === filterType);
  const parties = form.party_type === 'customer' ? mockCustomers : mockSuppliers;

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.party_id || !form.opening_balance) return toast.error('أكمل البيانات');
    const party = parties.find(p => p.id === Number(form.party_id));
    setBalances([...balances, {
      id: Date.now(), party_type: form.party_type, party_id: Number(form.party_id),
      party_name: party?.name || '', financial_year: '2025-2026',
      opening_balance: Number(form.opening_balance), type: form.type
    }]);
    toast.success('تم تسجيل الرصيد الافتتاحي');
    setShowModal(false);
    setForm(emptyForm);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا الرصيد؟')) return;
    setBalances(balances.filter(b => b.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">الأرصدة الافتتاحية</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> رصيد جديد</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        الأرصدة الافتتاحية تُسجَّل عند بداية استخدام النظام أو عند تقفيل السنة المالية. يمكن إضافتها يدوياً أو ترحيلها تلقائياً.
      </div>

      <select className="erp-input w-auto min-w-[150px]" value={filterType} onChange={e => setFilterType(e.target.value)}>
        <option value="">الكل</option>
        <option value="customer">عملاء</option>
        <option value="supplier">موردين</option>
      </select>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>النوع</th><th>الاسم</th><th>السنة المالية</th><th>مدين/دائن</th><th>الرصيد</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد أرصدة افتتاحية</td></tr>}
            {filtered.map((b, i) => (
              <tr key={b.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td>{b.party_type === 'customer' ? <span className="badge badge-blue">عميل</span> : <span className="badge badge-yellow">مورد</span>}</td>
                <td className="font-medium">{b.party_name}</td>
                <td>{b.financial_year}</td>
                <td>{b.type === 'مدين' ? <span className="badge badge-red">مدين</span> : <span className="badge badge-green">دائن</span>}</td>
                <td className="font-bold">{b.opening_balance.toLocaleString()} ج.م</td>
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
              <div><label className="form-label">الرصيد *</label><input type="number" className="erp-input" required value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} /></div>
              <div>
                <label className="form-label">مدين / دائن</label>
                <select className="erp-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="مدين">مدين (له علينا)</option>
                  <option value="دائن">دائن (لنا عنده)</option>
                </select>
              </div>
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

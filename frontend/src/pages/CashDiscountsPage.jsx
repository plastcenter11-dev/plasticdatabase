import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const today = () => new Date().toISOString().split('T')[0];
const emptyForm = { party_id: '', amount: '', date: today(), notes: '' };

// Cash discounts, kept apart from collections and payments: a customer's discount lowers what he owes,
// a supplier's discount lowers what we owe him. Stored as a receipt/payment with the method "خصم نقدي".
export default function CashDiscountsPage() {
  const { can } = useAuth();
  const kinds = [
    { key: 'customer', label: 'خصم عميل', module: 'cash_receipts', list: '/finance/cash-receipts', parties: '/customers', field: 'customer_id', rel: 'Customer', no: 'receipt_no', hint: 'من الحساب اللي عليه' },
    { key: 'supplier', label: 'خصم مورد', module: 'cash_payments', list: '/finance/cash-payments', parties: '/suppliers', field: 'supplier_id', rel: 'Supplier', no: 'payment_no', hint: 'من المبلغ المستحق له' },
  ].filter(k => can(k.module, 'view'));
  const [kindKey, setKindKey] = useState('customer');
  const kind = kinds.find(k => k.key === kindKey) || kinds[0];
  const [rows, setRows] = useState([]);
  const [parties, setParties] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    if (!kind) return;
    try {
      const [r, p] = await Promise.all([api.get(kind.list, { params: { kind: 'discount' } }), api.get(kind.parties)]);
      setRows(r.data); setParties(p.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, [kind?.key]);
  if (!kind) return null;

  const party = parties.find(p => p.id === Number(form.party_id));
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.party_id || !(Number(form.amount) > 0)) return toast.error('أكمل البيانات');
    try {
      await api.post(kind.list, { [kind.field]: Number(form.party_id), amount: Number(form.amount), date: form.date, notes: form.notes, payment_method: 'خصم نقدي' });
      toast.success('تم تسجيل الخصم');
      setShowModal(false); setForm(emptyForm); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الخصم؟')) return;
    try { await api.delete(`${kind.list}/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">خصومات نقدية</h1>
        {can(kind.module, 'create') && <button onClick={() => { setForm({ ...emptyForm, date: today() }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> خصم جديد</button>}
      </div>
      {kinds.length > 1 && (
        <div className="flex gap-2">
          {kinds.map(k => <button key={k.key} onClick={() => setKindKey(k.key)} className={`erp-btn ${kind.key === k.key ? 'erp-btn-primary' : 'erp-btn-outline'}`}>{k.label}</button>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد الخصومات</p><p className="text-lg font-bold">{rows.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي الخصومات</p><p className="text-lg font-bold">{total.toLocaleString()} ج.م</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>الرقم</th><th>التاريخ</th><th>{kind.key === 'customer' ? 'العميل' : 'المورد'}</th><th>المبلغ</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد خصومات</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-sm">{r[kind.no]}</td>
                <td>{r.date}</td>
                <td className="font-medium">{r[kind.rel]?.name || '-'}</td>
                <td className="font-bold">{Number(r.amount).toLocaleString()} ج.م</td>
                <td className="text-sm text-gray-500">{r.notes}</td>
                <td>{can(kind.module, 'delete') && <button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={kind.key === 'customer' ? 'خصم نقدي لعميل' : 'خصم نقدي من مورد'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">{kind.key === 'customer' ? 'العميل' : 'المورد'} *</label>
              <SearchableSelect className="erp-input" required value={form.party_id} onChange={e => setForm({ ...form, party_id: e.target.value })}>
                <option value="">— اختر —</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SearchableSelect>
              {party && (
                <div className="mt-1.5 text-sm rounded-lg px-3 py-1.5 space-y-0.5 bg-gray-50 text-gray-700">
                  <div>الرصيد الحالي: <strong>{Number(party.balance).toLocaleString()} ج.م</strong></div>
                  {Number(form.amount) > 0 && <div>الرصيد المتوقع بعد الخصم: <strong>{(Number(party.balance) - Number(form.amount)).toLocaleString()} ج.م</strong></div>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">مبلغ الخصم *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <p className="text-xs text-gray-500">الخصم بينزل {kind.hint}.</p>
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

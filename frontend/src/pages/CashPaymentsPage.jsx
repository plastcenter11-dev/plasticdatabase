import { useState, useEffect } from 'react';
import { saveAndNew } from '../utils/saveAndNew';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { todayStr } from '../utils/today';

const today = () => todayStr();
const emptyForm = () => ({ party_type: 'supplier', supplier_id: '', customer_id: '', amount: '', payment_method: 'نقدي', date: today(), notes: '' });

const balanceTone = (b) => Number(b) > 0 ? 'bg-red-50 text-red-700' : Number(b) < 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600';

// Cash paid out: to a supplier (what we owe goes down) or back to a customer, e.g. a refund
// (what the customer owes goes up).
export default function CashPaymentsPage() {
  const { can } = useAuth();
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const loadData = async (opts) => {
    try {
      const [p, s, c] = await Promise.all([api.get('/finance/cash-payments'), api.get('/suppliers'), api.get('/customers')]);
      setPayments(p.data); setSuppliers(s.data); setCustomers(c.data);
    } catch { if (!opts?.silent) toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);
  useAutoRefresh(loadData);

  const filtered = payments.filter(p => {
    if (!search) return true;
    return p.payment_no?.includes(search) || p.Supplier?.name?.includes(search) || p.Customer?.name?.includes(search);
  });

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const toCustomer = form.party_type === 'customer';
  const selectedSupplier = suppliers.find(s => s.id === Number(form.supplier_id));
  const selectedCustomer = customers.find(c => c.id === Number(form.customer_id));

  // an empty screen for a new record (the "new" button, and again after each new record is saved)
  const openFresh = () => { setForm(emptyForm()); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!(toCustomer ? form.customer_id : form.supplier_id) || !form.amount) return toast.error('أكمل البيانات');
    try {
      const { party_type, ...rest } = form;
      await api.post('/finance/cash-payments', {
        ...rest,
        amount: Number(form.amount),
        supplier_id: toCustomer ? null : Number(form.supplier_id),
        customer_id: toCustomer ? Number(form.customer_id) : null,
      });
      toast.success(toCustomer ? 'تم تسجيل رد الفلوس للعميل' : 'تم تسجيل الدفع');
      loadData(); saveAndNew(() => setShowModal(false), openFresh);
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
        {can('cash_payments', 'create') && <button onClick={openFresh} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> دفع جديد</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد المدفوعات</p><p className="text-lg font-bold">{payments.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المدفوعات</p><p className="text-lg font-bold text-danger">{totalAmount.toLocaleString()} ج.م</p></div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="erp-table">
          <thead><tr><th>رقم الإيصال</th><th>التاريخ</th><th>المورد / العميل</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد مدفوعات</td></tr>}
            {filtered.map(p => (
              <tr key={p.id}>
                <td className="font-mono text-sm">{p.payment_no}</td>
                <td>{p.date}</td>
                <td className="font-medium">
                  {p.Customer
                    ? <>{p.Customer.name} <span className="badge badge-gray">عميل — رد نقدية</span></>
                    : (p.Supplier?.name || '-')}
                </td>
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
              <label className="form-label">الدفع إلى</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1"><input type="radio" checked={!toCustomer} onChange={() => setForm({ ...form, party_type: 'supplier', customer_id: '' })} /> مورد</label>
                <label className="flex items-center gap-1"><input type="radio" checked={toCustomer} onChange={() => setForm({ ...form, party_type: 'customer', supplier_id: '' })} /> عميل (رد فلوس)</label>
              </div>
            </div>

            {!toCustomer ? (
              <div>
                <label className="form-label">المورد *</label>
                <SearchableSelect className="erp-input" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SearchableSelect>
                {selectedSupplier && (
                  <div className={`mt-1.5 text-sm rounded-lg px-3 py-1.5 space-y-0.5 ${balanceTone(selectedSupplier.balance)}`}>
                    <div>رصيد المورد الحالي: <strong>{Number(selectedSupplier.balance).toLocaleString()} ج.م</strong></div>
                    {Number(form.amount) > 0 && (
                      <div>الرصيد المتوقع بعد الدفعة: <strong>{(Number(selectedSupplier.balance) - Number(form.amount)).toLocaleString()} ج.م</strong></div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="form-label">العميل *</label>
                <SearchableSelect className="erp-input" required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SearchableSelect>
                {selectedCustomer && (
                  <div className={`mt-1.5 text-sm rounded-lg px-3 py-1.5 space-y-0.5 ${balanceTone(selectedCustomer.balance)}`}>
                    <div>رصيد العميل الحالي: <strong>{Number(selectedCustomer.balance).toLocaleString()} ج.م</strong></div>
                    {Number(form.amount) > 0 && (
                      <div>الرصيد المتوقع بعد رد الفلوس: <strong>{(Number(selectedCustomer.balance) + Number(form.amount)).toLocaleString()} ج.م</strong></div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <label className="form-label">طريقة الدفع</label>
              <select className="erp-input" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                <option value="نقدي">نقدي</option>
                <option value="تحويل بنكي">تحويل بنكي</option>
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

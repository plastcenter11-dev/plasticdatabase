import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف' },
  { id: 2, name: 'مصنع الأمل للبلاستيك' },
  { id: 3, name: 'توزيعات المحروسة' },
];

const initialReceipts = [
  { id: 1, receipt_no: 'CR-000001', date: '2026-06-15', customer_id: 1, amount: 5000, payment_method: 'نقدي', notes: 'سداد جزئي' },
  { id: 2, receipt_no: 'CR-000002', date: '2026-06-19', customer_id: 2, amount: 20000, payment_method: 'تحويل بنكي', notes: 'سداد فاتورة SI-000001' },
];

const emptyForm = { customer_id: '', amount: '', payment_method: 'نقدي', date: new Date().toISOString().split('T')[0], notes: '' };

export default function CashReceiptsPage() {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const filtered = receipts.filter(r => {
    if (!search) return true;
    const cust = mockCustomers.find(c => c.id === r.customer_id);
    return r.receipt_no.includes(search) || cust?.name.includes(search);
  });

  const getCustomerName = (id) => mockCustomers.find(c => c.id === id)?.name || '-';
  const totalAmount = receipts.reduce((s, r) => s + r.amount, 0);

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.amount) return toast.error('أكمل البيانات');
    setReceipts([{
      id: Date.now(), receipt_no: `CR-${String(receipts.length + 1).padStart(6, '0')}`,
      customer_id: Number(form.customer_id), amount: Number(form.amount),
      payment_method: form.payment_method, date: form.date, notes: form.notes
    }, ...receipts]);
    toast.success('تم تسجيل التحصيل');
    setShowModal(false);
    setForm(emptyForm);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا التحصيل؟')) return;
    setReceipts(receipts.filter(r => r.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">حركات تحصيل نقدية</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> تحصيل جديد</button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="stat-card"><p className="text-sm text-gray-500">عدد التحصيلات</p><p className="text-lg font-bold">{receipts.length}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي التحصيلات</p><p className="text-lg font-bold text-success">{totalAmount.toLocaleString()} ج.م</p></div>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>رقم الإيصال</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد تحصيلات</td></tr>}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-sm">{r.receipt_no}</td>
                <td>{r.date}</td>
                <td className="font-medium">{getCustomerName(r.customer_id)}</td>
                <td className="font-bold text-success">{r.amount.toLocaleString()} ج.م</td>
                <td><span className="badge badge-blue">{r.payment_method}</span></td>
                <td className="text-sm text-gray-500">{r.notes}</td>
                <td><button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="تحصيل نقدي جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">العميل *</label>
              <select className="erp-input" required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— اختر —</option>
                {mockCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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

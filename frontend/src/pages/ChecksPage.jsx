import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch, MdCheckCircle, MdCancel } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف' },
  { id: 2, name: 'مصنع الأمل للبلاستيك' },
  { id: 3, name: 'توزيعات المحروسة' },
];

const initialChecks = [
  { id: 1, check_no: 'CHK-001', date: '2026-06-10', customer_id: 1, amount: 10000, due_date: '2026-07-10', status: 'pending', bank: 'البنك الأهلي' },
  { id: 2, check_no: 'CHK-002', date: '2026-06-05', customer_id: 3, amount: 15000, due_date: '2026-06-15', status: 'pending', bank: 'بنك مصر' },
  { id: 3, check_no: 'CHK-003', date: '2026-05-20', customer_id: 2, amount: 8000, due_date: '2026-06-20', status: 'collected', bank: 'البنك الأهلي' },
];

const emptyForm = { check_no: '', customer_id: '', amount: '', due_date: '', bank: '', date: new Date().toISOString().split('T')[0] };

export default function ChecksPage() {
  const [checks, setChecks] = useState(initialChecks);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const today = new Date().toISOString().split('T')[0];
  const filtered = checks.filter(ch => {
    const cust = mockCustomers.find(c => c.id === ch.customer_id);
    const matchSearch = !search || ch.check_no.includes(search) || cust?.name.includes(search);
    const matchStatus = !filterStatus || ch.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getCustomerName = (id) => mockCustomers.find(c => c.id === id)?.name || '-';
  const isOverdue = (ch) => ch.status === 'pending' && ch.due_date < today;
  const pendingTotal = checks.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const overdueCount = checks.filter(c => isOverdue(c)).length;

  const statusBadge = (ch) => {
    if (ch.status === 'collected') return <span className="badge badge-green">تم التحصيل</span>;
    if (ch.status === 'bounced') return <span className="badge badge-red">مرتجع</span>;
    if (isOverdue(ch)) return <span className="badge badge-red">متأخر</span>;
    return <span className="badge badge-yellow">قيد الانتظار</span>;
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id || !form.amount || !form.check_no) return toast.error('أكمل البيانات');
    setChecks([{
      id: Date.now(), check_no: form.check_no, date: form.date,
      customer_id: Number(form.customer_id), amount: Number(form.amount),
      due_date: form.due_date, status: 'pending', bank: form.bank
    }, ...checks]);
    toast.success('تم تسجيل الشيك');
    setShowModal(false);
    setForm(emptyForm);
  };

  const handleCollect = (id) => {
    setChecks(checks.map(c => c.id === id ? { ...c, status: 'collected' } : c));
    toast.success('تم تحصيل الشيك');
  };

  const handleBounce = (id) => {
    setChecks(checks.map(c => c.id === id ? { ...c, status: 'bounced' } : c));
    toast.error('تم تسجيل الشيك كمرتجع');
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا الشيك؟')) return;
    setChecks(checks.filter(c => c.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">شيكات - قبض</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> شيك جديد</button>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <div className="stat-card"><p className="text-sm text-gray-500">قيد الانتظار</p><p className="text-lg font-bold text-warning">{pendingTotal.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">شيكات متأخرة</p><p className="text-lg font-bold text-danger">{overdueCount}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي الشيكات</p><p className="text-lg font-bold">{checks.length}</p></div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
          <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="erp-input w-auto min-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="pending">قيد الانتظار</option>
          <option value="collected">تم التحصيل</option>
          <option value="bounced">مرتجع</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>رقم الشيك</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>تاريخ الاستحقاق</th><th>البنك</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد شيكات</td></tr>}
            {filtered.map(ch => (
              <tr key={ch.id} className={isOverdue(ch) ? 'bg-red-50' : ''}>
                <td className="font-mono text-sm">{ch.check_no}</td>
                <td>{ch.date}</td>
                <td className="font-medium">{getCustomerName(ch.customer_id)}</td>
                <td className="font-bold">{ch.amount.toLocaleString()} ج.م</td>
                <td className={isOverdue(ch) ? 'text-red-600 font-bold' : ''}>{ch.due_date}</td>
                <td className="text-sm text-gray-600">{ch.bank}</td>
                <td>{statusBadge(ch)}</td>
                <td>
                  <div className="flex gap-1">
                    {ch.status === 'pending' && (
                      <>
                        <button onClick={() => handleCollect(ch.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs" title="تحصيل"><MdCheckCircle size={14} /></button>
                        <button onClick={() => handleBounce(ch.id)} className="erp-btn erp-btn-warning py-1 px-2 text-xs" title="مرتجع"><MdCancel size={14} /></button>
                      </>
                    )}
                    <button onClick={() => handleDelete(ch.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="شيك قبض جديد" onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">رقم الشيك *</label><input className="erp-input" required value={form.check_no} onChange={e => setForm({ ...form, check_no: e.target.value })} /></div>
              <div><label className="form-label">التاريخ</label><input type="date" className="erp-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <label className="form-label">العميل *</label>
              <select className="erp-input" required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— اختر —</option>
                {mockCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">تاريخ الاستحقاق *</label><input type="date" className="erp-input" required value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div><label className="form-label">البنك</label><input className="erp-input" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} /></div>
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

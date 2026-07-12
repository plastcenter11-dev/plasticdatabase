import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch, MdCheckCircle, MdCancel, MdShoppingCart } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { check_no: '', party_type: 'customer', party_id: '', amount: '', due_date: '', bank_name: '', date: new Date().toISOString().split('T')[0] };

export default function ChecksPage() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [ch, cu] = await Promise.all([api.get('/finance/checks'), api.get('/customers')]);
      setChecks(ch.data); setCustomers(cu.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const today = new Date().toISOString().split('T')[0];
  const filtered = checks.filter(ch => {
    const matchSearch = !search || ch.check_no?.includes(search);
    const matchStatus = !filterStatus || ch.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getPartyName = (ch) => customers.find(c => c.id === ch.party_id)?.name || '-';
  const isOverdue = (ch) => ch.status === 'pending' && ch.due_date < today;
  const pendingTotal = checks.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
  const overdueCount = checks.filter(c => isOverdue(c)).length;

  const statusBadge = (ch) => {
    if (ch.status === 'collected') return <span className="badge badge-green">تم التحصيل</span>;
    if (ch.status === 'bounced') return <span className="badge badge-red">مرتجع</span>;
    if (isOverdue(ch)) return <span className="badge badge-red">متأخر</span>;
    return <span className="badge badge-yellow">قيد الانتظار</span>;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.party_id || !form.amount || !form.check_no) return toast.error('أكمل البيانات');
    try {
      await api.post('/finance/checks', { ...form, party_id: Number(form.party_id), amount: Number(form.amount) });
      toast.success('تم تسجيل الشيك');
      setShowModal(false); setForm(emptyForm); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleCollect = async (id) => {
    try { await api.put(`/finance/checks/${id}`, { status: 'collected' }); toast.success('تم تحصيل الشيك'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleBounce = async (id) => {
    try { await api.put(`/finance/checks/${id}`, { status: 'bounced' }); toast.error('تم تسجيل الشيك كمرتجع'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الشيك؟')) return;
    try { await api.delete(`/finance/checks/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">شيكات - قبض</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/sales-orders', { state: { openNew: true } })} className="erp-btn erp-btn-outline flex items-center gap-1"><MdShoppingCart size={18} /> طلبية بيع جديدة</button>
          <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> شيك جديد</button>
        </div>
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
                <td className="font-medium">{getPartyName(ch)}</td>
                <td className="font-bold">{Number(ch.amount).toLocaleString()} ج.م</td>
                <td className={isOverdue(ch) ? 'text-red-600 font-bold' : ''}>{ch.due_date}</td>
                <td className="text-sm text-gray-600">{ch.bank_name}</td>
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
              <select className="erp-input" required value={form.party_id} onChange={e => setForm({ ...form, party_id: e.target.value })}>
                <option value="">— اختر —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">المبلغ *</label><input type="number" className="erp-input" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className="form-label">تاريخ الاستحقاق *</label><input type="date" className="erp-input" required value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div><label className="form-label">البنك</label><input className="erp-input" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
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

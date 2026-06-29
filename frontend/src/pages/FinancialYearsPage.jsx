import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdLock, MdCheckCircle } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { name: '', start_date: '', end_date: '' };

export default function FinancialYearsPage() {
  const [years, setYears] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [closeForm, setCloseForm] = useState({ next_year_id: '' });
  const [closing, setClosing] = useState(false);

  const loadData = async () => {
    try { setYears((await api.get('/financial-years')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const activeYear = years.find(y => y.is_active);
  const inactiveYears = years.filter(y => !y.is_active);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/financial-years/${editing.id}`, form); toast.success('تم التحديث'); }
      else { await api.post('/financial-years', form); toast.success('تمت الإضافة'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleActivate = async (id) => {
    if (!window.confirm('إعادة تنشيط هذه السنة المالية؟')) return;
    try { await api.post(`/financial-years/${id}/activate`); toast.success('تم إعادة تنشيط السنة المالية'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف السنة المالية؟')) return;
    try { await api.delete(`/financial-years/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleCloseYear = async () => {
    if (!closeForm.next_year_id) return toast.error('اختر السنة المالية الجديدة');
    const nextYear = years.find(y => y.id === Number(closeForm.next_year_id));
    if (!window.confirm(`تأكيد إقفال السنة المالية "${activeYear?.name}" وتفعيل "${nextYear?.name}"؟`)) return;
    setClosing(true);
    try {
      await api.post(`/financial-years/${activeYear.id}/close`, { next_year_id: Number(closeForm.next_year_id) });
      toast.success(`تم إقفال ${activeYear.name} وتفعيل ${nextYear.name}`);
      setShowCloseModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
    finally { setClosing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">السنوات المالية</h1>
        <div className="flex gap-2">
          {activeYear && inactiveYears.length > 0 && (
            <button onClick={() => { setCloseForm({ next_year_id: '' }); setShowCloseModal(true); }}
              className="erp-btn erp-btn-danger flex items-center gap-1"><MdLock size={18} /> إقفال السنة الحالية</button>
          )}
          <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة سنة</button>
        </div>
      </div>

      {activeYear && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <MdCheckCircle size={28} className="text-green-600" />
          <div>
            <p className="font-bold text-green-800">السنة المالية النشطة: {activeYear.name}</p>
            <p className="text-sm text-green-600">من {activeYear.start_date} إلى {activeYear.end_date}</p>
          </div>
        </div>
      )}

      {!activeYear && years.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-bold text-red-700">لا توجد سنة مالية نشطة — لن تتمكن من إنشاء فواتير جديدة</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>المسمى</th><th>من</th><th>إلى</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {years.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد سنوات مالية</td></tr>}
            {years.map((y, i) => (
              <tr key={y.id} className={y.is_active ? 'bg-green-50' : ''}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-bold text-lg">{y.name}</td>
                <td>{y.start_date}</td>
                <td>{y.end_date}</td>
                <td>{y.is_active ? <span className="badge badge-green font-bold">نشطة</span> : y.is_closed ? <span className="badge badge-gray">مقفولة</span> : <span className="badge badge-yellow">غير نشطة</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {!y.is_active && <button onClick={() => handleActivate(y.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs">إعادة تنشيط</button>}
                    <button onClick={() => { setEditing(y); setForm({ name: y.name, start_date: y.start_date, end_date: y.end_date }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    {!y.is_active && <button onClick={() => handleDelete(y.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل سنة مالية' : 'إضافة سنة مالية'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">المسمى *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: 2026" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">تاريخ البداية *</label><input type="date" className="erp-input" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><label className="form-label">تاريخ النهاية *</label><input type="date" className="erp-input" required value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      )}

      {showCloseModal && (
        <Modal title="إقفال السنة المالية" onClose={() => setShowCloseModal(false)} width="max-w-lg">
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <p className="font-bold text-yellow-800 mb-2">تحذير</p>
              <ul className="text-yellow-700 space-y-1 list-disc list-inside">
                <li>سيتم قفل السنة المالية <strong>{activeYear?.name}</strong></li>
                <li>ترحيل أرصدة العملاء والموردين كأرصدة افتتاحية</li>
                <li>تفعيل السنة الجديدة</li>
              </ul>
            </div>
            <div>
              <label className="form-label">السنة المالية الجديدة *</label>
              <select className="erp-input" value={closeForm.next_year_id} onChange={e => setCloseForm({ next_year_id: e.target.value })}>
                <option value="">— اختر السنة الجديدة —</option>
                {inactiveYears.map(y => <option key={y.id} value={y.id}>{y.name} ({y.start_date} → {y.end_date})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowCloseModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button onClick={handleCloseYear} disabled={closing || !closeForm.next_year_id} className="erp-btn erp-btn-danger disabled:opacity-50">
                {closing ? 'جاري الإقفال...' : 'تأكيد الإقفال'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

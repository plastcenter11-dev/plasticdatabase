import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdLock, MdCheckCircle } from 'react-icons/md';

const initialYears = [
  { id: 1, name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', is_active: false, invoice_count: 45 },
  { id: 2, name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true, invoice_count: 0 },
];

const emptyForm = { name: '', start_date: '', end_date: '' };

export default function FinancialYearsPage() {
  const [years, setYears] = useState(initialYears);
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [closeForm, setCloseForm] = useState({ next_year_id: '' });
  const [closing, setClosing] = useState(false);

  const activeYear = years.find(y => y.is_active);
  const inactiveYears = years.filter(y => !y.is_active);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (y) => { setEditing(y); setForm({ name: y.name, start_date: y.start_date, end_date: y.end_date }); setShowModal(true); };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing) {
      setYears(years.map(y => y.id === editing.id ? { ...y, ...form } : y));
      toast.success('تم التحديث');
    } else {
      setYears([...years, { ...form, id: Date.now(), is_active: false, invoice_count: 0 }]);
      toast.success('تمت الإضافة');
    }
    setShowModal(false);
  };

  const handleActivate = (id) => {
    if (!window.confirm('إعادة تنشيط هذه السنة المالية؟ ستصبح السنة النشطة وستُسجَّل عليها الفواتير الجديدة.')) return;
    setYears(years.map(y => ({ ...y, is_active: y.id === id })));
    toast.success('تم إعادة تنشيط السنة المالية');
  };

  const handleDelete = (id) => {
    const year = years.find(y => y.id === id);
    if (year?.is_active) return toast.error('لا يمكن حذف السنة النشطة');
    if (year?.invoice_count > 0) return toast.error('لا يمكن حذف سنة تحتوي على فواتير');
    if (!window.confirm('حذف السنة المالية؟')) return;
    setYears(years.filter(y => y.id !== id));
    toast.success('تم الحذف');
  };

  const handleCloseYear = () => {
    if (!closeForm.next_year_id) return toast.error('اختر السنة المالية الجديدة');
    const nextYear = years.find(y => y.id === Number(closeForm.next_year_id));
    if (!window.confirm(
      `تأكيد إقفال السنة المالية "${activeYear?.name}"\n\n` +
      `سيتم:\n` +
      `• ترحيل أرصدة المخزون كرصيد أول المدة لـ "${nextYear?.name}"\n` +
      `• ترحيل أرصدة العملاء والموردين\n` +
      `• قفل السنة الحالية\n` +
      `• تفعيل السنة الجديدة "${nextYear?.name}"\n\n` +
      `هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟`
    )) return;

    setClosing(true);
    setTimeout(() => {
      setYears(years.map(y => {
        if (y.id === activeYear.id) return { ...y, is_active: false };
        if (y.id === Number(closeForm.next_year_id)) return { ...y, is_active: true };
        return y;
      }));
      toast.success(`تم إقفال ${activeYear.name} وتفعيل ${nextYear.name} — تم ترحيل أرصدة المخزون والعملاء والموردين`);
      setShowCloseModal(false);
      setClosing(false);
    }, 1500);
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
          <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة سنة</button>
        </div>
      </div>

      {activeYear && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <MdCheckCircle size={28} className="text-green-600" />
          <div>
            <p className="font-bold text-green-800">السنة المالية النشطة: {activeYear.name}</p>
            <p className="text-sm text-green-600">من {activeYear.start_date} إلى {activeYear.end_date}</p>
            <p className="text-xs text-green-500 mt-1">كل الفواتير الجديدة ستُسجَّل في هذه السنة — عدد الفواتير: {activeYear.invoice_count}</p>
          </div>
        </div>
      )}

      {!activeYear && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-bold text-red-700">لا توجد سنة مالية نشطة — لن تتمكن من إنشاء فواتير جديدة</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>المسمى</th><th>من</th><th>إلى</th><th>عدد الفواتير</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {years.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد سنوات مالية</td></tr>}
            {years.map((y, i) => (
              <tr key={y.id} className={y.is_active ? 'bg-green-50' : ''}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-bold text-lg">{y.name}</td>
                <td>{y.start_date}</td>
                <td>{y.end_date}</td>
                <td>{y.invoice_count}</td>
                <td>{y.is_active ? <span className="badge badge-green font-bold">نشطة</span> : <span className="badge badge-gray">مقفولة</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {!y.is_active && (
                      <button onClick={() => handleActivate(y.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs">إعادة تنشيط</button>
                    )}
                    <button onClick={() => openEdit(y)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    {!y.is_active && y.invoice_count === 0 && (
                      <button onClick={() => handleDelete(y.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                    )}
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
            <div><label className="form-label">المسمى *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: 2026-2027" /></div>
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
              <p className="font-bold text-yellow-800 mb-2">تحذير — هذا الإجراء لا يمكن التراجع عنه</p>
              <ul className="text-yellow-700 space-y-1 list-disc list-inside">
                <li>سيتم قفل السنة المالية <strong>{activeYear?.name}</strong></li>
                <li>ترحيل أرصدة المخزون كرصيد أول المدة للسنة الجديدة</li>
                <li>ترحيل أرصدة العملاء والموردين كأرصدة افتتاحية</li>
                <li>لن تقبل السنة المقفولة أي فواتير جديدة</li>
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
              <button onClick={handleCloseYear} disabled={closing || !closeForm.next_year_id}
                className="erp-btn erp-btn-danger disabled:opacity-50">
                {closing ? 'جاري الإقفال...' : 'تأكيد الإقفال'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

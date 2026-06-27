import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';

const initialEmployees = [
  { id: 1, name: 'أحمد محمد', phone: '01012345678', commission_rate: 2, is_active: true },
  { id: 2, name: 'خالد علي', phone: '01198765432', commission_rate: 1.5, is_active: true },
  { id: 3, name: 'محمود حسن', phone: '01234567890', commission_rate: 3, is_active: false },
];

const emptyForm = { name: '', phone: '', commission_rate: '', is_active: true };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState(initialEmployees);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (emp) => { setEditing(emp); setForm({ name: emp.name, phone: emp.phone, commission_rate: emp.commission_rate, is_active: emp.is_active }); setShowModal(true); };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing) {
      setEmployees(employees.map(emp => emp.id === editing.id ? { ...emp, ...form, commission_rate: Number(form.commission_rate) } : emp));
      toast.success('تم التحديث');
    } else {
      setEmployees([...employees, { ...form, id: Date.now(), commission_rate: Number(form.commission_rate) }]);
      toast.success('تمت الإضافة');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا الموظف؟')) return;
    setEmployees(employees.filter(emp => emp.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تعريف موظفين</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة موظف</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>نسبة العمولة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا يوجد موظفين</td></tr>}
            {employees.map((emp, i) => (
              <tr key={emp.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{emp.name}</td>
                <td className="font-mono text-sm">{emp.phone}</td>
                <td><span className="badge badge-blue">{emp.commission_rate}%</span></td>
                <td>{emp.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(emp)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(emp.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل موظف' : 'إضافة موظف'} onClose={() => setShowModal(false)} width="max-w-md">
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="form-label">الاسم *</label><input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الهاتف</label><input className="erp-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="form-label">نسبة العمولة %</label><input type="number" step="0.1" className="erp-input" value={form.commission_rate} onChange={e => setForm({ ...form, commission_rate: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="emp_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <label htmlFor="emp_active" className="text-sm text-gray-700">موظف نشط</label>
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

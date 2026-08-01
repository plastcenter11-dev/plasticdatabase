import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { name: '', phone: '', commission_rate: '', is_active: true };

export default function EmployeesPage() {
  const { can } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setEmployees((await api.get('/employees')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, commission_rate: Number(form.commission_rate || 0) };
      if (editing) { await api.put(`/employees/${editing.id}`, payload); toast.success('تم التحديث'); }
      else { await api.post('/employees', payload); toast.success('تمت الإضافة'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الموظف؟')) return;
    try { await api.delete(`/employees/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تعريف موظفين</h1>
        {can('employees', 'create') && <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة موظف</button>}
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
                    {can('employees', 'edit') && <button onClick={() => { setEditing(emp); setForm({ name: emp.name, phone: emp.phone || '', commission_rate: emp.commission_rate, is_active: emp.is_active }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    {can('employees', 'delete') && <button onClick={() => handleDelete(emp.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
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

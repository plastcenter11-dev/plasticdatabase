import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import api from '../api/axios';

const allPermissions = [
  { key: 'items', label: 'الأصناف' },
  { key: 'warehouses', label: 'المخازن' },
  { key: 'stock', label: 'حركة المخزون (صرف/إضافة/تحويل)' },
  { key: 'customers', label: 'العملاء' },
  { key: 'suppliers', label: 'الموردين' },
  { key: 'sales_orders', label: 'أوامر البيع' },
  { key: 'delivery_notes', label: 'إذون التسليم' },
  { key: 'sales_invoices', label: 'فواتير البيع (والمرتجعات)' },
  { key: 'purchase_invoices', label: 'فواتير الشراء (والمرتجعات)' },
  { key: 'cash_receipts', label: 'تحصيلات نقدية' },
  { key: 'cash_payments', label: 'مدفوعات نقدية' },
  { key: 'checks', label: 'الشيكات' },
  { key: 'expenses', label: 'المصروفات' },
  { key: 'other_income', label: 'إيرادات أخرى' },
  { key: 'employees', label: 'الموظفين' },
  { key: 'financial_years', label: 'السنوات المالية والأرصدة الافتتاحية' },
  { key: 'reports', label: 'التقارير' },
  { key: 'settings', label: 'الإعدادات' },
];

const emptyForm = { username: '', password: '', role: 'user', is_active: true, permissions: {} };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try { setUsers((await api.get('/users')).data); }
    catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const togglePerm = (key, action) => {
    const perms = { ...form.permissions };
    if (!perms[key]) perms[key] = [];
    if (perms[key].includes(action)) perms[key] = perms[key].filter(a => a !== action);
    else perms[key] = [...perms[key], action];
    if (perms[key].length === 0) delete perms[key];
    setForm({ ...form, permissions: perms });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.username) return toast.error('أدخل اسم المستخدم');
    if (!editing && !form.password) return toast.error('أدخل كلمة المرور');
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      if (editing) { await api.put(`/users/${editing.id}`, payload); toast.success('تم التحديث'); }
      else { await api.post('/users', payload); toast.success('تمت الإضافة'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا المستخدم؟')) return;
    try { await api.delete(`/users/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">حقوق المستخدمين</h1>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إضافة مستخدم</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>اسم المستخدم</th><th>الدور</th><th>الصلاحيات</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا يوجد مستخدمين</td></tr>}
            {users.map((u, i) => (
              <tr key={u.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{u.username}</td>
                <td>{u.role === 'admin' ? <span className="badge badge-red">مسؤول</span> : <span className="badge badge-blue">مستخدم</span>}</td>
                <td className="text-sm text-gray-500">
                  {u.role === 'admin' ? 'كل الصلاحيات' : !u.permissions || Object.keys(u.permissions).length === 0 ? 'بدون صلاحيات' :
                    Object.entries(u.permissions).map(([k, v]) => {
                      const perm = allPermissions.find(p => p.key === k);
                      return <span key={k} className="badge badge-gray ml-1 mb-1">{perm?.label}: {Array.isArray(v) ? v.join('/') : v}</span>;
                    })
                  }
                </td>
                <td>{u.is_active ? <span className="badge badge-green">نشط</span> : <span className="badge badge-gray">غير نشط</span>}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(u); setForm({ username: u.username, password: '', role: u.role, is_active: u.is_active, permissions: u.permissions || {} }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    {u.role !== 'admin' && <button onClick={() => handleDelete(u.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل مستخدم' : 'إضافة مستخدم'} onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">اسم المستخدم *</label><input className="erp-input" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
              <div><label className="form-label">{editing ? 'كلمة مرور جديدة' : 'كلمة المرور *'}</label><input type="password" className="erp-input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              <div><label className="form-label">الدور</label><select className="erp-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="admin">مسؤول</option><option value="user">مستخدم</option></select></div>
            </div>

            {form.role === 'user' && (
              <div>
                <label className="form-label">الصلاحيات</label>
                <div className="border rounded-lg p-3 max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr><th className="text-right pb-2">القسم</th><th className="text-center pb-2">عرض</th><th className="text-center pb-2">إضافة</th><th className="text-center pb-2">تعديل</th><th className="text-center pb-2">حذف</th></tr></thead>
                    <tbody>
                      {allPermissions.map(p => (
                        <tr key={p.key} className="border-t">
                          <td className="py-2 font-medium">{p.label}</td>
                          {['view', 'create', 'edit', 'delete'].map(action => (
                            <td key={action} className="text-center py-2">
                              <input type="checkbox" checked={form.permissions[p.key]?.includes(action) || false} onChange={() => togglePerm(p.key, action)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="user_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <label htmlFor="user_active" className="text-sm text-gray-700">مستخدم نشط</label>
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

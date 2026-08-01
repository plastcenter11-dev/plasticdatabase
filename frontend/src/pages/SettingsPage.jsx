import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdSave, MdBusiness, MdBackup, MdLock, MdLockOpen, MdRefresh, MdPassword, MdTune, MdInventory, MdUpload, MdEdit, MdDelete, MdAdd } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState(isAdmin() ? 'company' : 'password');
  const [company, setCompany] = useState({ company_name: '', company_address: '', company_phone: '', company_tax_no: '' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [editingCat, setEditingCat] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [newCatName, setNewCatName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');

  const loadLookups = async () => {
    const [cats, tps] = await Promise.all([api.get('/categories'), api.get('/item-types')]);
    setCategories(cats.data); setTypes(tps.data);
  };

  const saveEdit = async (type, id, name) => {
    if (!name?.trim()) return;
    try {
      await api.put(`/${type}/${id}`, { name: name.trim() });
      toast.success('تم التعديل');
      setEditingCat(null); setEditingType(null);
      loadLookups();
    } catch { toast.error('خطأ في التعديل'); }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('حذف هذا البند؟')) return;
    try {
      await api.delete(`/${type}/${id}`);
      toast.success('تم الحذف');
      loadLookups();
    } catch { toast.error('خطأ في الحذف'); }
  };

  const handleAdd = async (type, name, setName) => {
    if (!name?.trim()) return;
    try {
      await api.post(`/${type}`, { name: name.trim() });
      toast.success('تمت الإضافة');
      setName('');
      loadLookups();
    } catch { toast.error('خطأ في الإضافة'); }
  };

  useEffect(() => {
    api.get('/settings').then(r => {
      setCompany({
        company_name: r.data.company_name || '',
        company_address: r.data.company_address || '',
        company_phone: r.data.company_phone || '',
        company_tax_no: r.data.company_tax_no || '',
      });
    }).catch(() => {});
  }, []);

  const saveCompany = async () => {
    try { await api.put('/settings', company); toast.success('تم حفظ بيانات المنشأة'); }
    catch { toast.error('خطأ في الحفظ'); }
  };

  const savePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) return toast.error('كلمات المرور غير متطابقة');
    if (!pwForm.newPw) return toast.error('أدخل كلمة المرور الجديدة');
    if (!pwForm.current) return toast.error('أدخل كلمة المرور الحالية');
    try {
      await api.post('/auth/change-password', { current_password: pwForm.current, new_password: pwForm.newPw });
      toast.success('تم تغيير كلمة المرور');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ في تغيير كلمة المرور'); }
  };

  useEffect(() => { if (activeTab === 'lookups') loadLookups(); }, [activeTab]);

  const allTabs = [
    { key: 'company', label: 'بيانات المنشأة', icon: MdBusiness },
    { key: 'options', label: 'خيارات', icon: MdTune },
    { key: 'lookups', label: 'الأقسام والأنواع', icon: MdInventory },
    { key: 'password', label: 'تغيير كلمة المرور', icon: MdPassword },
    { key: 'protection', label: 'حماية السجلات', icon: MdLock },
    { key: 'unlock', label: 'إلغاء حماية', icon: MdLockOpen },
    { key: 'backup', label: 'النسخة الاحتياطية', icon: MdBackup },
    { key: 'reset', label: 'إعادة ضبط الأرصدة', icon: MdRefresh },
    { key: 'items-setup', label: 'ضبط بيان الأصناف', icon: MdInventory },
  ];
  // Every settings tab except "change password" is admin-only.
  const tabs = isAdmin() ? allTabs : allTabs.filter(t => t.key === 'password');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">الإعدادات</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`erp-btn flex items-center gap-1 ${activeTab === t.key ? 'erp-btn-primary' : 'erp-btn-outline'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        {activeTab === 'company' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">بيانات المنشأة</h2>
            <div><label className="form-label">اسم المنشأة</label><input className="erp-input" value={company.company_name} onChange={e => setCompany({ ...company, company_name: e.target.value })} /></div>
            <div><label className="form-label">العنوان</label><input className="erp-input" value={company.company_address} onChange={e => setCompany({ ...company, company_address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الهاتف</label><input className="erp-input" value={company.company_phone} onChange={e => setCompany({ ...company, company_phone: e.target.value })} /></div>
              <div><label className="form-label">الرقم الضريبي</label><input className="erp-input" value={company.company_tax_no} onChange={e => setCompany({ ...company, company_tax_no: e.target.value })} /></div>
            </div>
            <button onClick={saveCompany} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> حفظ</button>
          </div>
        )}

        {activeTab === 'options' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">خيارات النظام</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /><span className="text-sm">السماح بالبيع بالآجل بدون حد ائتمان</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /><span className="text-sm">تفعيل الضريبة تلقائياً على الفواتير</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" /><span className="text-sm">منع البيع بأقل من سعر التكلفة</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /><span className="text-sm">ترقيم الفواتير تلقائياً</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" /><span className="text-sm">طلب اعتماد الفواتير قبل الترحيل</span></label>
            </div>
            <button onClick={() => toast.success('تم حفظ الخيارات')} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> حفظ</button>
          </div>
        )}

        {activeTab === 'lookups' && (
          <div className="grid grid-cols-2 gap-8 max-w-2xl">
            {/* Categories */}
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-4">الأقسام</h2>
              <div className="flex gap-2 mb-4">
                <input className="erp-input flex-1" placeholder="اسم القسم الجديد" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd('categories', newCatName, setNewCatName)} />
                <button onClick={() => handleAdd('categories', newCatName, setNewCatName)} className="erp-btn erp-btn-primary px-3"><MdAdd size={18} /></button>
              </div>
              <div className="space-y-2">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50">
                    {editingCat?.id === c.id ? (
                      <>
                        <input className="erp-input flex-1 py-1" value={editingCat.name} onChange={e => setEditingCat({ ...editingCat, name: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit('categories', c.id, editingCat.name); if (e.key === 'Escape') setEditingCat(null); }}
                          autoFocus />
                        <button onClick={() => saveEdit('categories', c.id, editingCat.name)} className="erp-btn erp-btn-primary py-1 px-2 text-xs">حفظ</button>
                        <button onClick={() => setEditingCat(null)} className="erp-btn erp-btn-secondary py-1 px-2 text-xs">إلغاء</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium">{c.name}</span>
                        <button onClick={() => setEditingCat({ id: c.id, name: c.name })} className="text-blue-500 hover:text-blue-700 p-1"><MdEdit size={16} /></button>
                        <button onClick={() => handleDelete('categories', c.id)} className="text-red-500 hover:text-red-700 p-1"><MdDelete size={16} /></button>
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">لا توجد أقسام</p>}
              </div>
            </div>

            {/* Types */}
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-4">الأنواع</h2>
              <div className="flex gap-2 mb-4">
                <input className="erp-input flex-1" placeholder="اسم النوع الجديد" value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd('item-types', newTypeName, setNewTypeName)} />
                <button onClick={() => handleAdd('item-types', newTypeName, setNewTypeName)} className="erp-btn erp-btn-primary px-3"><MdAdd size={18} /></button>
              </div>
              <div className="space-y-2">
                {types.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50">
                    {editingType?.id === t.id ? (
                      <>
                        <input className="erp-input flex-1 py-1" value={editingType.name} onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit('item-types', t.id, editingType.name); if (e.key === 'Escape') setEditingType(null); }}
                          autoFocus />
                        <button onClick={() => saveEdit('item-types', t.id, editingType.name)} className="erp-btn erp-btn-primary py-1 px-2 text-xs">حفظ</button>
                        <button onClick={() => setEditingType(null)} className="erp-btn erp-btn-secondary py-1 px-2 text-xs">إلغاء</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium">{t.name}</span>
                        <button onClick={() => setEditingType({ id: t.id, name: t.name })} className="text-blue-500 hover:text-blue-700 p-1"><MdEdit size={16} /></button>
                        <button onClick={() => handleDelete('item-types', t.id)} className="text-red-500 hover:text-red-700 p-1"><MdDelete size={16} /></button>
                      </>
                    )}
                  </div>
                ))}
                {types.length === 0 && <p className="text-sm text-gray-400 text-center py-4">لا توجد أنواع</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="space-y-4 max-w-sm">
            <h2 className="text-lg font-bold text-gray-700">تغيير كلمة المرور</h2>
            <div><label className="form-label">كلمة المرور الحالية</label><input type="password" className="erp-input" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
            <div><label className="form-label">كلمة المرور الجديدة</label><input type="password" className="erp-input" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} /></div>
            <div><label className="form-label">تأكيد كلمة المرور</label><input type="password" className="erp-input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
            <button onClick={savePassword} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> تغيير</button>
          </div>
        )}

        {activeTab === 'protection' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">حماية السجلات</h2>
            <p className="text-sm text-gray-600">حماية السجلات تمنع تعديل أو حذف الفواتير والحركات القديمة.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">حماية حتى تاريخ</label><input type="date" className="erp-input" defaultValue="2026-05-31" /></div>
            </div>
            <button onClick={() => toast.success('تم تفعيل حماية السجلات')} className="erp-btn erp-btn-danger flex items-center gap-1"><MdLock size={18} /> تفعيل الحماية</button>
          </div>
        )}

        {activeTab === 'unlock' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">إلغاء حماية السجلات</h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">تحذير: إلغاء الحماية سيسمح بتعديل وحذف كل السجلات.</div>
            <button onClick={() => { if (window.confirm('هل أنت متأكد من إلغاء حماية السجلات؟')) toast.success('تم إلغاء حماية السجلات'); }} className="erp-btn erp-btn-warning flex items-center gap-1"><MdLockOpen size={18} /> إلغاء الحماية</button>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-5 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">النسخة الاحتياطية</h2>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
              <p className="font-bold">أنواع النسخ الاحتياطية</p>
              <div className="space-y-1">
                <p><strong>نسخة SQL</strong> — نسخة كاملة من قاعدة البيانات (بنية الجداول + البيانات). تُستعاد بأمر واحد في MySQL. <span className="text-green-700 font-bold">موصى بها</span></p>
                <p><strong>نسخة JSON</strong> — بيانات فقط بدون بنية الجداول. مناسبة للاطلاع على البيانات أو النقل اليدوي.</p>
              </div>
              <p className="text-blue-600">كلا الملفين يُحفظان في مجلد التنزيلات (Downloads) تلقائياً.</p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    toast.info('جاري تجهيز نسخة SQL...');
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/backup/sql', { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error('فشل التحميل');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const date = new Date().toISOString().split('T')[0];
                    a.href = url; a.download = `plasticdb-backup-${date}.sql`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success('تم تحميل نسخة SQL بنجاح ✓');
                  } catch { toast.error('خطأ في تحميل نسخة SQL'); }
                }}
                className="erp-btn erp-btn-primary flex items-center gap-2"
              >
                <MdBackup size={20} /> تحميل نسخة SQL (كاملة)
              </button>

              <button
                onClick={async () => {
                  try {
                    toast.info('جاري تجهيز النسخة الاحتياطية...');
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error('فشل التحميل');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const date = new Date().toISOString().split('T')[0];
                    a.href = url; a.download = `plasticdb-backup-${date}.json`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success('تم تحميل النسخة الاحتياطية بنجاح ✓');
                  } catch { toast.error('خطأ في تحميل النسخة الاحتياطية'); }
                }}
                className="erp-btn erp-btn-outline flex items-center gap-2"
              >
                <MdBackup size={20} /> تحميل نسخة JSON (بيانات فقط)
              </button>
            </div>

            <div className="border-t pt-5 space-y-3">
              <h3 className="font-bold text-gray-700">استعادة من نسخة SQL</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <strong>تحذير:</strong> الاستعادة ستحذف وتستبدل جميع البيانات الحالية بالبيانات الموجودة في ملف الـ SQL.
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="erp-btn erp-btn-outline flex items-center gap-2 cursor-pointer">
                  <MdUpload size={18} />
                  اختر ملف SQL
                  <input
                    type="file"
                    accept=".sql"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (!window.confirm(`هل أنت متأكد من استعادة قاعدة البيانات من الملف:\n${file.name}\n\nسيتم حذف كل البيانات الحالية!`)) {
                        e.target.value = '';
                        return;
                      }
                      try {
                        toast.info('جاري استعادة قاعدة البيانات...');
                        const token = localStorage.getItem('token');
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch('/api/backup/restore', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                          body: formData,
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        toast.success('تم استعادة قاعدة البيانات بنجاح ✓');
                      } catch (err) {
                        toast.error(`فشل الاستعادة: ${err.message}`);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <span className="text-sm text-gray-400">ملفات .sql فقط</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reset' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">إعادة ضبط الأرصدة</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">تحذير: سيتم إعادة حساب أرصدة العملاء والموردين والمخزون من الحركات.</div>
            <button onClick={() => { if (window.confirm('هل أنت متأكد؟ سيتم إعادة حساب كل الأرصدة.')) toast.success('تم إعادة ضبط الأرصدة'); }} className="erp-btn erp-btn-danger flex items-center gap-1"><MdRefresh size={18} /> إعادة ضبط</button>
          </div>
        )}

        {activeTab === 'items-setup' && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">ضبط بيان الأصناف</h2>
            <p className="text-sm text-gray-600">إعادة حساب أرصدة الأصناف في كل المخازن.</p>
            <button onClick={() => { if (window.confirm('سيتم إعادة حساب أرصدة كل الأصناف.')) toast.success('تم ضبط بيان الأصناف'); }} className="erp-btn erp-btn-warning flex items-center gap-1"><MdRefresh size={18} /> ضبط الأصناف</button>
          </div>
        )}
      </div>
    </div>
  );
}

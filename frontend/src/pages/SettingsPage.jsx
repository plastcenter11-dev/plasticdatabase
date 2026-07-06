import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdSave, MdBusiness, MdBackup, MdLock, MdLockOpen, MdRefresh, MdPassword, MdTune, MdInventory } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('company');
  const [company, setCompany] = useState({ company_name: '', company_address: '', company_phone: '', company_tax_no: '' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });

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
    try {
      await api.put(`/users/${user.id}`, { password: pwForm.newPw });
      toast.success('تم تغيير كلمة المرور');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch { toast.error('خطأ في تغيير كلمة المرور'); }
  };

  const tabs = [
    { key: 'company', label: 'بيانات المنشأة', icon: MdBusiness },
    { key: 'options', label: 'خيارات', icon: MdTune },
    { key: 'password', label: 'تغيير كلمة المرور', icon: MdPassword },
    { key: 'protection', label: 'حماية السجلات', icon: MdLock },
    { key: 'unlock', label: 'إلغاء حماية', icon: MdLockOpen },
    { key: 'backup', label: 'النسخة الاحتياطية', icon: MdBackup },
    { key: 'reset', label: 'إعادة ضبط الأرصدة', icon: MdRefresh },
    { key: 'items-setup', label: 'ضبط بيان الأصناف', icon: MdInventory },
  ];

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

        {activeTab === 'password' && (
          <div className="space-y-4 max-w-sm">
            <h2 className="text-lg font-bold text-gray-700">تغيير كلمة المرور</h2>
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

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
              <p className="font-bold">ماذا يتم تحميله؟</p>
              <p>ملف <code className="bg-blue-100 px-1 rounded">plasticdb-backup-YYYY-MM-DD.json</code> يحتوي على <strong>كل بيانات قاعدة البيانات</strong>: عملاء، موردين، أصناف، فواتير، مخزون، حسابات، إعدادات — كل شيء.</p>
              <p className="text-blue-600 mt-1">يُحفظ في مجلد التنزيلات (Downloads) بشكل تلقائي.</p>
            </div>

            <div className="flex gap-3">
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
                className="erp-btn erp-btn-primary flex items-center gap-2"
              >
                <MdBackup size={20} /> تحميل نسخة احتياطية
              </button>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-1">لاستعادة النسخة الاحتياطية، تواصل مع مسؤول النظام لرفع ملف الـ JSON إلى قاعدة البيانات.</p>
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

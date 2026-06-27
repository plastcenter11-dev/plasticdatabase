import { useState } from 'react';
import { toast } from 'react-toastify';
import { MdSave, MdBusiness, MdBackup, MdLock, MdLockOpen, MdRefresh, MdPassword, MdTune, MdInventory } from 'react-icons/md';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company');
  const [company, setCompany] = useState({ name: 'مصنع بلاست سنتر', address: 'القاهرة - المنطقة الصناعية', phone: '02-12345678', tax_no: '123-456-789', logo: '' });

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
            <div><label className="form-label">اسم المنشأة</label><input className="erp-input" value={company.name} onChange={e => setCompany({ ...company, name: e.target.value })} /></div>
            <div><label className="form-label">العنوان</label><input className="erp-input" value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الهاتف</label><input className="erp-input" value={company.phone} onChange={e => setCompany({ ...company, phone: e.target.value })} /></div>
              <div><label className="form-label">الرقم الضريبي</label><input className="erp-input" value={company.tax_no} onChange={e => setCompany({ ...company, tax_no: e.target.value })} /></div>
            </div>
            <button onClick={() => toast.success('تم حفظ بيانات المنشأة')} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> حفظ</button>
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
            <div><label className="form-label">كلمة المرور الحالية</label><input type="password" className="erp-input" /></div>
            <div><label className="form-label">كلمة المرور الجديدة</label><input type="password" className="erp-input" /></div>
            <div><label className="form-label">تأكيد كلمة المرور</label><input type="password" className="erp-input" /></div>
            <button onClick={() => toast.success('تم تغيير كلمة المرور')} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> تغيير</button>
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
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-gray-700">النسخة الاحتياطية</h2>
            <p className="text-sm text-gray-600">تحميل نسخة احتياطية من قاعدة البيانات.</p>
            <div className="flex gap-3">
              <button onClick={() => toast.success('جاري تحميل النسخة الاحتياطية...')} className="erp-btn erp-btn-primary flex items-center gap-1"><MdBackup size={18} /> تحميل نسخة احتياطية</button>
              <button onClick={() => toast.info('اختر ملف النسخة الاحتياطية')} className="erp-btn erp-btn-outline flex items-center gap-1"><MdRefresh size={18} /> استعادة نسخة</button>
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

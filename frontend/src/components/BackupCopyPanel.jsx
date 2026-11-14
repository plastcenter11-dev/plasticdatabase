import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { MdFolder, MdFolderOpen, MdArrowUpward, MdUsb, MdCheckCircle, MdError } from 'react-icons/md';
import api from '../api/axios';
import Modal from './Modal';

const when = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('en-CA')} ${d.toLocaleTimeString('en-GB')}`; };

// Pick the folder where a second copy of every daily backup goes (a USB drive, a synced cloud
// folder, a network share), try it, and take a backup right now.
export default function BackupCopyPanel() {
  const [info, setInfo] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/backup/copy').then(r => setInfo(r.data)).catch(() => toast.error('تعذّر تحميل إعداد النسخة الثانية')), []);
  useEffect(() => { load(); }, [load]);

  const save = async (dir) => {
    try {
      await api.put('/backup/copy', { dir });
      toast.success(dir ? 'تم حفظ مكان النسخة الثانية' : 'تم إلغاء النسخة الثانية');
      setPicking(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'تعذّر الحفظ'); }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      const r = await api.post('/backup/run');
      if (r.data.ok) toast.success('تمت النسخة الاحتياطية' + (info?.dir ? ' والنسخة الثانية' : ''));
      else toast.error('فشلت النسخة الاحتياطية — ' + (r.data.output || '').split('\n').pop());
    } catch { toast.error('تعذّر تشغيل النسخة الاحتياطية'); }
    setBusy(false);
    load();
  };

  if (!info) return null;
  const ok = info.check?.ok;

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-white">
      <div>
        <h3 className="font-bold text-gray-700">نسخة ثانية خارج الجهاز</h3>
        <p className="text-sm text-gray-500">كل يوم بيتعمل نسخة احتياطية على الجهاز ده. اختار فلاشة أو فولدر مزامن مع السحابة أو مشاركة على الشبكة، وهتتنسخ فيه كمان، عشان لو الجهاز اتعطل ماتضيعش الداتا.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-gray-600">المكان الحالي:</span>
        {info.dir
          ? <span className="font-medium" dir="ltr">{info.dir}</span>
          : <span className="text-amber-700">لم يُحدَّد — النسخ على الجهاز ده بس</span>}
        {info.source === 'env' && <span className="badge badge-gray">من ملف الإعدادات (.env)</span>}
      </div>

      {info.dir && (
        <div className={`flex items-center gap-1.5 text-sm ${ok ? 'text-green-700' : 'text-red-600'}`}>
          {ok ? <MdCheckCircle size={18} /> : <MdError size={18} />} {info.check.message}
        </div>
      )}

      {info.dir && info.last && (
        <div className={`text-sm ${info.last.ok ? 'text-gray-600' : 'text-red-600'}`}>
          آخر نسخة ثانية: {when(info.last.at)} — {info.last.message}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button className="erp-btn erp-btn-primary flex items-center gap-1" onClick={() => setPicking(true)}><MdFolderOpen size={18} /> اختيار المكان</button>
        <button className="erp-btn erp-btn-outline" disabled={busy} onClick={backupNow}>{busy ? 'جاري النسخ...' : 'نسخ احتياطي الآن'}</button>
        {info.source === 'setting' && <button className="erp-btn erp-btn-outline text-red-600" onClick={() => save('')}>إلغاء النسخة الثانية</button>}
      </div>

      {picking && <FolderPicker start={info.dir} onClose={() => setPicking(false)} onPick={save} />}
    </div>
  );
}

function FolderPicker({ start, onClose, onPick }) {
  const [view, setView] = useState({ path: '', parent: null, dirs: [] });
  const [error, setError] = useState('');

  const open = useCallback((p) => {
    setError('');
    api.get('/backup/browse', { params: { path: p } })
      .then(r => setView(r.data))
      .catch(err => setError(err.response?.data?.error || 'لا يمكن فتح هذا المكان'));
  }, []);
  useEffect(() => { open(start || ''); }, [open, start]);

  return (
    <Modal title="اختيار مكان النسخة الثانية" onClose={onClose} width="max-w-lg" zIndex={60}>
      <div className="space-y-3">
        <div className="text-sm bg-gray-50 rounded-lg px-3 py-2 min-h-[2.25rem]" dir="ltr">{view.path || 'الأقراص المتاحة'}</div>
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
          {view.parent !== null && (
            <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => open(view.parent)}>
              <MdArrowUpward size={18} className="text-gray-400" /> رجوع
            </button>
          )}
          {view.dirs.length === 0 && !error && <div className="px-3 py-4 text-center text-gray-400 text-sm">لا توجد مجلدات هنا</div>}
          {view.dirs.map(d => (
            <button key={d.path} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-sm text-right" onClick={() => open(d.path)}>
              {view.path ? <MdFolder size={18} className="text-amber-500" /> : <MdUsb size={18} className="text-blue-500" />}
              <span dir="ltr">{d.name}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button className="erp-btn erp-btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="erp-btn erp-btn-primary" disabled={!view.path} onClick={() => onPick(view.path)}>اختيار هذا المكان</button>
        </div>
        <p className="text-xs text-gray-400">بعد الاختيار البرنامج بيجرّب يكتب في المكان، ولو مش شغال مش هيحفظه.</p>
      </div>
    </Modal>
  );
}

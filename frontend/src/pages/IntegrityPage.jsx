import { useState } from 'react';
import { toast } from 'react-toastify';
import { MdFactCheck, MdCheckCircle, MdError, MdWarning, MdPrint } from 'react-icons/md';
import api from '../api/axios';

// The accounting integrity test (admin only). It only reads: the server recomputes every figure from the documents
// and compares it with what the program stored and shows.
const state = (r) => (r.errors ? 'error' : r.warnings ? 'warning' : 'ok');
const LOOK = {
  ok: { Icon: MdCheckCircle, color: 'text-green-600', text: 'سليم' },
  warning: { Icon: MdWarning, color: 'text-yellow-600', text: 'تنبيه' },
  error: { Icon: MdError, color: 'text-red-600', text: 'خطأ' },
};

export default function IntegrityPage() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setReport(null);
    try { setReport((await api.get('/integrity')).data); }
    catch (err) { toast.error(err.response?.data?.error || 'تعذّر تنفيذ الفحص'); }
    finally { setRunning(false); }
  };

  const overall = !report ? null : report.errors ? 'error' : report.warnings ? 'warning' : 'ok';
  const banner = {
    ok: { box: 'bg-green-50 border-green-200 text-green-800', title: 'الحسابات والمخازن سليمة' },
    warning: { box: 'bg-yellow-50 border-yellow-200 text-yellow-800', title: 'لا توجد أخطاء — توجد تنبيهات للمراجعة' },
    error: { box: 'bg-red-50 border-red-200 text-red-800', title: 'توجد أخطاء في البيانات' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">فحص سلامة الحسابات</h1>
        <div className="flex gap-2">
          {report && <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>}
          <button onClick={run} disabled={running} className="erp-btn erp-btn-primary flex items-center gap-1 disabled:opacity-50"><MdFactCheck size={20} /> {running ? 'جاري الفحص...' : report ? 'إعادة الفحص' : 'ابدأ الفحص'}</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 text-sm text-gray-600">
        الفحص بيقرأ البيانات بس ومابيغيّرش حاجة. بيتأكد إن أرصدة العملاء والموردين مطابقة للمستندات وكشوف الحساب، وإن الفواتير مجموعها صح، وإن المخزون مطابق لحركاته، وإن كل مستند مرحّل له حركة مخزن.
        الأفضل تشغّله وقت ما محدش بيدخّل بيانات؛ ولو ظهر خطأ أعد الفحص للتأكد.
      </div>

      {running && <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">جاري الفحص... ممكن ياخد دقيقة مع البيانات الكتيرة</div>}

      {report && (
        <>
          <div className={`rounded-xl border p-4 ${banner[overall].box}`}>
            <div className="text-lg font-bold">{banner[overall].title}</div>
            <div className="text-sm mt-1">
              الأخطاء: <strong>{report.errors}</strong> — التنبيهات: <strong>{report.warnings}</strong> — تاريخ الفحص: {new Date(report.checked_at).toLocaleString('ar-EG')} ({report.seconds} ثانية)
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="erp-table">
              <thead><tr><th>النتيجة</th><th>البند</th><th>عدد المفحوص</th></tr></thead>
              <tbody>
                {report.results.map(r => {
                  const { Icon, color, text } = LOOK[state(r)];
                  const hidden = r.errors + r.warnings - r.violations.length;
                  return (
                    <tr key={r.code}>
                      <td className={`${color} font-bold whitespace-nowrap`}><span className="inline-flex items-center gap-1"><Icon size={18} /> {text}</span></td>
                      <td>
                        <div className="font-medium">{r.title}</div>
                        {r.violations.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-sm">
                            {r.violations.map((v, i) => <li key={i} className={v.severity === 'error' ? 'text-red-700' : 'text-yellow-700'}>• {v.message}</li>)}
                            {hidden > 0 && <li className="text-gray-400">و {hidden} غيرها...</li>}
                          </ul>
                        )}
                      </td>
                      <td className="text-gray-500">{r.examined}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

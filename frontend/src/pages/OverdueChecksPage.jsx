import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdPrint, MdCheckCircle } from 'react-icons/md';
import api from '../api/axios';

export default function OverdueChecksPage() {
  const [checks, setChecks] = useState([]);

  const load = () => api.get('/finance/checks/overdue').then(r => setChecks(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const markCollected = async (id) => {
    try {
      await api.put(`/finance/checks/${id}`, { status: 'collected' });
      toast.success('تم تحديث حالة الشيك');
      load();
    } catch { toast.error('خطأ'); }
  };

  const totalAmount = checks.reduce((s, c) => s + Number(c.amount), 0);
  const daysPast = (dueDate) => {
    const diff = new Date() - new Date(dueDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const handlePrint = () => {
    const rows = checks.map(c => `<tr>
      <td>${c.check_no}</td><td>${c.due_date}</td><td>${c.party_type === 'customer' ? 'عميل' : 'مورد'}</td>
      <td>${Number(c.amount).toLocaleString()}</td><td>${daysPast(c.due_date)} يوم</td>
    </tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<html dir="rtl"><head><title>شيكات متأخرة</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:right;font-size:13px}th{background:#f0f0f0}</style></head>
      <body><h2 style="text-align:center">شيكات قبض متأخرة</h2>
      <table><thead><tr><th>رقم الشيك</th><th>تاريخ الاستحقاق</th><th>الطرف</th><th>القيمة</th><th>التأخير</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="text-align:left;font-weight:bold;margin-top:10px">الإجمالي: ${totalAmount.toLocaleString()} ج.م</p>
      </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">شيكات قبض متأخرة</h1>
        <button onClick={handlePrint} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      {checks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-red-700 font-bold">{checks.length} شيك متأخر</span>
          <span className="text-red-700 font-bold text-lg">{totalAmount.toLocaleString()} ج.م</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>رقم الشيك</th><th>الاستحقاق</th><th>الطرف</th><th>نوع الطرف</th><th>القيمة</th><th>التأخير</th><th>إجراء</th></tr></thead>
          <tbody>
            {checks.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-green-500 font-medium">✓ لا توجد شيكات متأخرة</td></tr>}
            {checks.map(c => (
              <tr key={c.id} className="bg-red-50/50">
                <td className="font-mono text-sm">{c.check_no}</td>
                <td className="text-red-600 font-medium">{c.due_date}</td>
                <td>{c.party_id}</td>
                <td>{c.party_type === 'customer' ? 'عميل' : 'مورد'}</td>
                <td className="font-bold">{Number(c.amount).toLocaleString()} ج.م</td>
                <td><span className="badge badge-red">{daysPast(c.due_date)} يوم</span></td>
                <td>
                  <button onClick={() => markCollected(c.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1">
                    <MdCheckCircle size={14} /> تحصيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

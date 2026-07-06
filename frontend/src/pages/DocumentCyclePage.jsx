import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { MdSave } from 'react-icons/md';
import api from '../api/axios';

const DOC_TYPES = [
  { key: 'sales_order', label: 'طلبية البيع', prefix: 'SO-', start: 1 },
  { key: 'delivery_note', label: 'إذن التسليم', prefix: 'DN-', start: 1 },
  { key: 'sales_invoice', label: 'فاتورة البيع', prefix: 'SI-', start: 1 },
  { key: 'sales_return', label: 'مرتجع مبيعات', prefix: 'SR-', start: 1 },
  { key: 'purchase_invoice', label: 'فاتورة الشراء', prefix: 'PI-', start: 1 },
  { key: 'purchase_return', label: 'مرتجع مشتريات', prefix: 'PR-', start: 1 },
  { key: 'cash_receipt', label: 'سند قبض', prefix: 'CR-', start: 1 },
  { key: 'cash_payment', label: 'سند صرف', prefix: 'CP-', start: 1 },
  { key: 'stock_adjustment', label: 'تسوية مخزون', prefix: 'SA-', start: 1 },
  { key: 'warehouse_transfer', label: 'تحويل مخازن', prefix: 'WT-', start: 1 },
];

const FLOW_RULES = [
  { key: 'delivery_auto_invoice', label: 'ترحيل إذن التسليم ينشئ فاتورة بيع تلقائياً', default: true },
  { key: 'require_order_before_delivery', label: 'يشترط طلبية بيع لإنشاء إذن تسليم', default: false },
  { key: 'allow_partial_delivery', label: 'السماح بالتسليم الجزئي للطلبيات', default: true },
  { key: 'auto_number_docs', label: 'ترقيم المستندات تلقائياً', default: true },
  { key: 'block_sale_over_credit', label: 'منع البيع عند تجاوز حد الائتمان', default: false },
  { key: 'require_warehouse_on_invoice', label: 'يشترط تحديد المخزن في فواتير البيع', default: true },
];

export default function DocumentCyclePage() {
  const [prefixes, setPrefixes] = useState({});
  const [startNos, setStartNos] = useState({});
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings').then(r => {
      const s = r.data;
      const p = {}, n = {}, ru = {};
      DOC_TYPES.forEach(d => {
        p[d.key] = s[`prefix_${d.key}`] ?? d.prefix;
        n[d.key] = s[`start_${d.key}`] ?? d.start;
      });
      FLOW_RULES.forEach(r => {
        ru[r.key] = s[r.key] !== undefined ? s[r.key] === 'true' || s[r.key] === true : r.default;
      });
      setPrefixes(p); setStartNos(n); setRules(ru);
    }).catch(() => {
      // defaults
      const p = {}, n = {}, ru = {};
      DOC_TYPES.forEach(d => { p[d.key] = d.prefix; n[d.key] = d.start; });
      FLOW_RULES.forEach(r => { ru[r.key] = r.default; });
      setPrefixes(p); setStartNos(n); setRules(ru);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      const payload = {};
      DOC_TYPES.forEach(d => {
        payload[`prefix_${d.key}`] = prefixes[d.key];
        payload[`start_${d.key}`] = String(startNos[d.key]);
      });
      FLOW_RULES.forEach(r => {
        payload[r.key] = String(rules[r.key]);
      });
      await api.put('/settings', payload);
      toast.success('تم حفظ إعدادات الدورة المستندية');
    } catch { toast.error('خطأ في الحفظ'); }
  };

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">إعدادات الدورة المستندية</h1>
        <button onClick={save} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> حفظ الإعدادات</button>
      </div>

      {/* Document numbering */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-bold text-gray-700">ترقيم المستندات</h2>
          <p className="text-xs text-gray-500 mt-0.5">البادئة ورقم البداية لكل نوع مستند</p>
        </div>
        <table className="erp-table">
          <thead>
            <tr><th>نوع المستند</th><th>البادئة (Prefix)</th><th>رقم البداية</th><th>مثال</th></tr>
          </thead>
          <tbody>
            {DOC_TYPES.map(d => (
              <tr key={d.key}>
                <td className="font-medium">{d.label}</td>
                <td>
                  <input
                    className="erp-input py-1 w-24 font-mono text-sm"
                    value={prefixes[d.key] ?? d.prefix}
                    onChange={e => setPrefixes(p => ({ ...p, [d.key]: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    className="erp-input py-1 w-24"
                    value={startNos[d.key] ?? d.start}
                    onChange={e => setStartNos(n => ({ ...n, [d.key]: e.target.value }))}
                  />
                </td>
                <td className="font-mono text-sm text-gray-400">
                  {prefixes[d.key] ?? d.prefix}{String(startNos[d.key] ?? d.start).padStart(4, '0')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Flow rules */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-bold text-gray-700">قواعد سير العمل</h2>
          <p className="text-xs text-gray-500 mt-0.5">التحكم في كيفية انتقال المستندات بين المراحل</p>
        </div>
        <div className="divide-y">
          {FLOW_RULES.map(r => (
            <label key={r.key} className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-700">{r.label}</span>
              <div
                onClick={() => setRules(ru => ({ ...ru, [r.key]: !ru[r.key] }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${rules[r.key] ? 'bg-primary' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rules[r.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} className="erp-btn erp-btn-primary flex items-center gap-1"><MdSave size={18} /> حفظ الإعدادات</button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { MdSearch, MdExpandMore, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import api from '../api/axios';

const PAGE = 50;

const ACTIONS = {
  create: { label: 'إضافة', badge: 'badge-green' },
  update: { label: 'تعديل', badge: 'badge-blue' },
  delete: { label: 'حذف', badge: 'badge-red' },
  login: { label: 'دخول', badge: 'badge-gray' },
  login_failed: { label: 'دخول فاشل', badge: 'badge-yellow' },
};

const ENTITIES = {
  SalesInvoice: 'فاتورة بيع', SalesInvoiceItem: 'أسطر فاتورة بيع', PurchaseInvoice: 'فاتورة شراء', PurchaseInvoiceItem: 'أسطر فاتورة شراء',
  SalesReturn: 'مرتجع بيع', SalesReturnItem: 'أسطر مرتجع بيع', PurchaseReturn: 'مرتجع شراء', PurchaseReturnItem: 'أسطر مرتجع شراء',
  DeliveryNote: 'إذن تسليم', DeliveryNoteItem: 'أسطر إذن تسليم', DeliveryNoteOrder: 'ربط إذن تسليم',
  Customer: 'عميل', Supplier: 'مورد', Item: 'صنف', Category: 'قسم', ItemType: 'نوع صنف', Warehouse: 'مخزن', Employee: 'موظف',
  CashReceipt: 'تحصيل / خصم عميل', CashPayment: 'دفع / خصم مورد', Check: 'شيك', Expense: 'مصروف', OtherIncome: 'إيراد آخر',
  WarehouseTransfer: 'تحويل مخازن', WarehouseTransferItem: 'أسطر تحويل', ItemAssembly: 'تركيب صنف', ItemAssemblyComponent: 'مكونات تركيب',
  OpeningBalance: 'رصيد افتتاحي', FinancialYear: 'سنة مالية', Settings: 'إعداد', User: 'مستخدم', SalesOrder: 'طلبية بيع', SalesOrderItem: 'أسطر طلبية',
};

const FIELDS = {
  name: 'الاسم', code: 'الكود', phone: 'الهاتف', address: 'العنوان', balance: 'الرصيد', credit_limit: 'حد الائتمان', sales_rep: 'المندوب',
  is_active: 'نشط', is_stockable: 'مخزني', unit: 'الوحدة', purchase_price: 'سعر الشراء', sale_price: 'سعر البيع', reorder_level: 'حد الطلب', width: 'العرض',
  invoice_no: 'رقم الفاتورة', return_no: 'رقم المرتجع', receipt_no: 'رقم السند', check_no: 'رقم الشيك', note_no: 'رقم الإذن', date: 'التاريخ', due_date: 'الاستحقاق',
  status: 'الحالة', subtotal: 'الإجمالي قبل الخصم', discount: 'الخصم', tax_rate: 'نسبة الضريبة', tax_amount: 'الضريبة', total: 'الإجمالي', paid: 'المدفوع', remaining: 'المتبقي',
  amount: 'المبلغ', quantity: 'العدد', weight: 'الوزن', price: 'السعر', net_weight: 'الوزن الصافي', gross_weight: 'الوزن القائم', roll_count: 'عدد البكر',
  customer_id: 'العميل', supplier_id: 'المورد', warehouse_id: 'المخزن', item_id: 'الصنف', employee_id: 'المندوب', description: 'الوصف', notes: 'ملاحظات', reason: 'السبب',
  username: 'اسم المستخدم', role: 'الدور', permissions: 'الصلاحيات', password: 'كلمة المرور', key: 'المفتاح', value: 'القيمة', commission_rate: 'نسبة العمولة',
  movement_type: 'نوع الحركة', payment_method: 'طريقة الدفع', bank_name: 'البنك', approved_at: 'تاريخ الاعتماد', delivery_note_id: 'إذن التسليم', invoice_id: 'الفاتورة',
  assembled_item_id: 'الصنف المركّب', assembled_qty: 'عدد المركّب', assembled_weight: 'وزن المركّب', from_warehouse_id: 'من مخزن', to_warehouse_id: 'إلى مخزن',
};

const fieldName = (k) => FIELDS[k] || k;
const show = (v, key, refs) => {
  if (v === null || v === undefined || v === '') return '—';
  if (key && refs && refs[key] && refs[key][v] !== undefined) return `${refs[key][v]} (#${v})`;
  if (v === true) return 'نعم';
  if (v === false) return 'لا';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
const when = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('en-CA')} ${d.toLocaleTimeString('en-GB')}`; };

function Details({ row, refs }) {
  const c = row.changes;
  if (row.action === 'login' || row.action === 'login_failed') return <span className="text-gray-600">عنوان الجهاز: {row.ip || '—'}</span>;
  if (!c) return <span className="text-gray-400">لا توجد تفاصيل</span>;
  if (row.action === 'update' && c.set) {
    return <div className="space-y-0.5"><div>تعديل جماعي — القيم: {Object.entries(c.set).map(([k, v]) => `${fieldName(k)} = ${show(v, k, refs)}`).join('، ')}</div><div className="text-gray-400 text-xs break-all">{c.where}</div></div>;
  }
  if (row.action === 'update') {
    return (
      <ul className="space-y-0.5">
        {Object.entries(c).map(([k, v]) => (
          <li key={k}><span className="font-medium">{fieldName(k)}:</span> <span className="text-red-600">{show(v.from, k, refs)}</span> ← <span className="text-green-700">{show(v.to, k, refs)}</span></li>
        ))}
      </ul>
    );
  }
  if (c.rows) {
    return (
      <div className="space-y-1">
        {c.rows.map((r, i) => <div key={i} className="text-gray-700">{Object.entries(r).filter(([, v]) => v !== null && v !== '' && v !== 0).map(([k, v]) => `${fieldName(k)}: ${show(v, k, refs)}`).join(' · ')}</div>)}
        {c.more ? <div className="text-gray-400">… و{c.more} سطر آخر</div> : null}
      </div>
    );
  }
  if (c.where) return <div className="text-gray-500 text-xs break-all">{c.where}</div>;
  const entries = Object.entries(c).filter(([, v]) => v !== null && v !== '');
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
      {entries.map(([k, v]) => <li key={k}><span className="font-medium">{fieldName(k)}:</span> {show(v, k, refs)}</li>)}
    </ul>
  );
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ from: '', to: '', username: '', action: '', entity: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [lists, setLists] = useState({ usernames: [], entities: [] });
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => { api.get('/audit-logs/filters').then(r => setLists(r.data)).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = { limit: PAGE, offset };
    Object.entries(applied).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/audit-logs', { params })
      .then(r => { setRows(r.data.rows); setRefs(r.data.refs || {}); setTotal(r.data.total); setOpen(new Set()); })
      .catch(() => setError('تعذّر تحميل السجل'))
      .finally(() => setLoading(false));
  }, [applied, offset]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const apply = (e) => { e?.preventDefault(); setOffset(0); setApplied(filters); };
  const reset = () => { const empty = { from: '', to: '', username: '', action: '', entity: '', q: '' }; setFilters(empty); setOffset(0); setApplied(empty); };
  const toggle = (id) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">سجل العمليات</h1>
        <span className="text-sm text-gray-500">مين أضاف أو عدّل أو حذف إيه ومتى — للمدير فقط، ولا يمكن تعديله أو مسحه من البرنامج</span>
      </div>

      <form onSubmit={apply} className="page-card !p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
        <div><label className="form-label">من تاريخ</label><input type="date" className="erp-input" value={filters.from} onChange={e => set('from', e.target.value)} /></div>
        <div><label className="form-label">إلى تاريخ</label><input type="date" className="erp-input" value={filters.to} onChange={e => set('to', e.target.value)} /></div>
        <div>
          <label className="form-label">المستخدم</label>
          <select className="erp-input" value={filters.username} onChange={e => set('username', e.target.value)}>
            <option value="">الكل</option>
            {lists.usernames.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">العملية</label>
          <select className="erp-input" value={filters.action} onChange={e => set('action', e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">النوع</label>
          <select className="erp-input" value={filters.entity} onChange={e => set('entity', e.target.value)}>
            <option value="">الكل</option>
            {lists.entities.map(en => <option key={en} value={en}>{ENTITIES[en] || en}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">بحث في البيان</label>
          <input className="erp-input" placeholder="رقم فاتورة أو اسم..." value={filters.q} onChange={e => set('q', e.target.value)} />
        </div>
        <div className="flex gap-2 col-span-2 md:col-span-4 lg:col-span-6">
          <button type="submit" className="erp-btn erp-btn-primary flex items-center gap-1"><MdSearch size={18} /> بحث</button>
          <button type="button" onClick={reset} className="erp-btn erp-btn-outline">مسح الفلاتر</button>
        </div>
      </form>

      <div className="page-card !p-0 overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>النوع</th><th>البيان</th><th></th></tr></thead>
          <tbody>
            {error && <tr><td colSpan={6} className="text-center py-6 text-red-600">{error}</td></tr>}
            {!error && !loading && rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد عمليات مسجّلة</td></tr>}
            {rows.map(r => {
              const a = ACTIONS[r.action] || { label: r.action, badge: 'badge-gray' };
              const isOpen = open.has(r.id);
              return [
                <tr key={r.id} className="cursor-pointer" onClick={() => toggle(r.id)}>
                  <td className="whitespace-nowrap text-sm" dir="ltr">{when(r.createdAt)}</td>
                  <td className="font-medium">{r.username || '—'}</td>
                  <td><span className={`badge ${a.badge}`}>{a.label}</span></td>
                  <td>{ENTITIES[r.entity] || r.entity || '—'}</td>
                  <td>{r.label || '—'}{r.entity_id ? <span className="text-xs text-gray-400"> (#{r.entity_id})</span> : null}</td>
                  <td className="w-8"><MdExpandMore className={`text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`} /></td>
                </tr>,
                isOpen && <tr key={`${r.id}-d`} className="bg-gray-50"><td colSpan={6} className="text-sm"><Details row={r} refs={refs} /></td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>{total === 0 ? '0 عملية' : `${from} - ${to} من ${total.toLocaleString()} عملية`}</span>
        <div className="flex gap-2">
          <button className="erp-btn erp-btn-outline flex items-center gap-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><MdChevronRight size={18} /> السابق</button>
          <button className="erp-btn erp-btn-outline flex items-center gap-1" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>التالي <MdChevronLeft size={18} /></button>
        </div>
      </div>
    </div>
  );
}

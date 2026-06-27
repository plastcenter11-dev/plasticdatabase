import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch, MdPrint } from 'react-icons/md';

const mockSuppliers = [
  { id: 1, name: 'شركة البترول للبتروكيماويات' },
  { id: 2, name: 'مصنع الخليج للبلاستيك' },
];

const mockPurchaseInvoices = [
  { id: 1, invoice_no: 'PI-000001', supplier_id: 1, date: '2026-06-10', items: [
    { item_id: 1, name: 'بولي إيثيلين عالي الكثافة', quantity: 1000, price: 40 },
  ]},
  { id: 2, invoice_no: 'PI-000002', supplier_id: 2, date: '2026-06-18', items: [
    { item_id: 2, name: 'بولي بروبيلين', quantity: 300, price: 48 },
  ]},
];

const initialReturns = [
  { id: 1, return_no: 'PR-000001', date: '2026-06-22', supplier_id: 1, invoice_no: 'PI-000001', reason: 'خامات تالفة', total: 4000, items: [
    { item_id: 1, name: 'بولي إيثيلين عالي الكثافة', quantity: 100, price: 40, total: 4000 },
  ]},
];

const emptyItem = { item_id: '', name: '', quantity: '', price: '', total: 0 };

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState(initialReturns);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }] });

  const filtered = returns.filter(r => {
    if (!search) return true;
    const sup = mockSuppliers.find(s => s.id === r.supplier_id);
    return r.return_no.includes(search) || sup?.name.includes(search) || r.invoice_no.includes(search);
  });

  const getSupplierName = (id) => mockSuppliers.find(s => s.id === id)?.name || '-';

  const availableInvoices = form.supplier_id
    ? mockPurchaseInvoices.filter(inv => inv.supplier_id === Number(form.supplier_id))
    : [];

  const handleSupplierChange = (supplierId) => {
    setForm({ ...form, supplier_id: supplierId, invoice_id: '', items: [{ ...emptyItem }] });
  };

  const handleInvoiceChange = (invoiceId) => {
    const inv = mockPurchaseInvoices.find(i => i.id === Number(invoiceId));
    if (inv) {
      const items = inv.items.map(i => ({
        item_id: i.item_id, name: i.name, quantity: '', price: i.price, total: 0, max_qty: i.quantity,
      }));
      setForm({ ...form, invoice_id: invoiceId, items });
    } else {
      setForm({ ...form, invoice_id: invoiceId, items: [{ ...emptyItem }] });
    }
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    items[idx].total = (Number(items[idx].quantity) || 0) * (Number(items[idx].price) || 0);
    setForm({ ...form, items });
  };

  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const calcTotal = () => form.items.reduce((sum, i) => sum + (i.total || 0), 0);

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.supplier_id) return toast.error('اختر المورد');
    if (form.items.every(i => !i.quantity || Number(i.quantity) === 0)) return toast.error('أدخل كمية المرتجع');

    const validItems = form.items.filter(i => Number(i.quantity) > 0);
    for (const item of validItems) {
      if (item.max_qty && Number(item.quantity) > item.max_qty) {
        return toast.error(`كمية المرتجع لـ "${item.name}" أكبر من الكمية المشتراة (${item.max_qty})`);
      }
    }

    const inv = mockPurchaseInvoices.find(i => i.id === Number(form.invoice_id));
    setReturns([{
      id: Date.now(),
      return_no: `PR-${String(returns.length + 1).padStart(6, '0')}`,
      date: form.date,
      supplier_id: Number(form.supplier_id),
      invoice_no: inv?.invoice_no || '-',
      reason: form.reason,
      total: calcTotal(),
      items: validItems.map(i => ({ item_id: i.item_id, name: i.name, quantity: Number(i.quantity), price: Number(i.price), total: i.total })),
    }, ...returns]);
    toast.success('تم تسجيل مرتجع المشتريات');
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا المرتجع؟ سيتم عكس تأثيره على المخزون ورصيد المورد.')) return;
    setReturns(returns.filter(r => r.id !== id));
    toast.success('تم حذف المرتجع');
  };

  const handlePrint = (ret) => {
    const sup = getSupplierName(ret.supplier_id);
    const printContent = `
      <html dir="rtl"><head><title>مرتجع مشتريات ${ret.return_no}</title>
      <style>
        body{font-family:Cairo,sans-serif;padding:30px 40px;direction:rtl;font-size:14px}
        h1{text-align:center;font-size:20px;margin-bottom:20px}
        .info{display:flex;justify-content:space-between;margin-bottom:15px}
        table{width:100%;border-collapse:collapse;margin:15px 0}
        th,td{border:1px solid #333;padding:8px 10px;text-align:right}
        th{background:#e8e8e8;font-weight:bold}
        .total-row{font-weight:bold;background:#f5f5f5}
        .reason{margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:5px}
      </style></head><body>
      <h1>مرتجع مشتريات</h1>
      <div class="info">
        <span>رقم المرتجع: <strong>${ret.return_no}</strong></span>
        <span>التاريخ: ${ret.date.split('-').reverse().join('/')}</span>
      </div>
      <div class="info">
        <span>المورد: <strong>${sup}</strong></span>
        <span>رقم الفاتورة: <strong>${ret.invoice_no}</strong></span>
      </div>
      ${ret.reason ? `<div class="reason">السبب: ${ret.reason}</div>` : ''}
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${ret.items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.name}</td><td>${item.quantity}</td><td>${item.price.toLocaleString()} ج.م</td><td>${item.total.toLocaleString()} ج.م</td></tr>`).join('')}
          <tr class="total-row"><td colspan="4">الإجمالي</td><td>${ret.total.toLocaleString()} ج.م</td></tr>
        </tbody>
      </table>
      </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">مرتجع مشتريات</h1>
        <button onClick={() => { setForm({ supplier_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }] }); setShowModal(true); }}
          className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مرتجع جديد</button>
      </div>

      <div className="page-card">
        <div className="relative max-w-md mb-4">
          <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
          <input className="erp-input pr-10" placeholder="بحث برقم المرتجع أو المورد أو الفاتورة..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="erp-table">
            <thead><tr><th>رقم المرتجع</th><th>التاريخ</th><th>المورد</th><th>فاتورة الشراء</th><th>الأصناف</th><th>الإجمالي</th><th>السبب</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>}
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-sm">{r.return_no}</td>
                  <td>{r.date}</td>
                  <td className="font-medium">{getSupplierName(r.supplier_id)}</td>
                  <td className="font-mono text-sm text-gray-500">{r.invoice_no}</td>
                  <td>
                    {r.items.map((item, i) => (
                      <div key={i} className="text-sm">{item.name} — {item.quantity} × {item.price} ج.م</div>
                    ))}
                  </td>
                  <td className="font-bold text-red-600">{r.total.toLocaleString()} ج.م</td>
                  <td className="text-sm text-gray-500">{r.reason || '-'}</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => handlePrint(r)} className="erp-btn erp-btn-outline py-1 px-2 text-xs flex items-center gap-1"><MdPrint size={14} /> طباعة</button>
                      <button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="مرتجع مشتريات جديد" onClose={() => setShowModal(false)} width="max-w-3xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">المورد *</label>
                <select className="erp-input" required value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)}>
                  <option value="">— اختر —</option>
                  {mockSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">فاتورة الشراء</label>
                <select className="erp-input" value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}>
                  <option value="">— اختر الفاتورة —</option>
                  {availableInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no} ({inv.date})</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">التاريخ *</label>
                <input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="form-label">سبب المرتجع</label>
              <input className="erp-input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="مثال: خامات تالفة، مواصفات غير مطابقة..." />
            </div>

            <div>
              <label className="form-label mb-2">الأصناف المرتجعة</label>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الكمية المشتراة</th><th>كمية المرتجع *</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium">{item.name || <span className="text-gray-400">—</span>}</td>
                      <td className="text-gray-500">{item.max_qty || '-'}</td>
                      <td><input type="number" min="0" max={item.max_qty || undefined} className="erp-input py-1 w-24" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                      <td>{Number(item.price || 0).toLocaleString()} ج.م</td>
                      <td className="font-bold">{(item.total || 0).toLocaleString()} ج.م</td>
                      <td>{form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-left mt-2 text-lg font-bold text-red-600">إجمالي المرتجع: {calcTotal().toLocaleString()} ج.م</div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ المرتجع</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdCheckCircle, MdPrint, MdDeleteSweep } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف' },
  { id: 2, name: 'مصنع الأمل للبلاستيك' },
  { id: 3, name: 'توزيعات المحروسة' },
];
const mockEmployees = [
  { id: 1, name: 'أحمد محمد', commission_rate: 2 },
  { id: 2, name: 'خالد علي', commission_rate: 1.5 },
];
const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', price: 45, unit: 'كيلو' },
  { id: 3, code: 'FP-001', name: 'أكياس بلاستيك 30×40', price: 2.5, unit: 'قطعة' },
  { id: 4, code: 'FP-002', name: 'عبوات PET 500ml', price: 1.8, unit: 'قطعة' },
];

const initialInvoices = [
  { id: 1, invoice_no: 'SI-000001', date: '2026-06-19', customer_id: 2, employee_id: 1, status: 'posted', subtotal: 22500, discount: 500, tax_rate: 14, tax_amount: 3080, total: 25080, paid: 20000, remaining: 5080, items: [
    { item_id: 1, name: 'بولي إيثيلين عالي الكثافة', quantity: 500, price: 45, discount: 0, total: 22500 },
  ]},
  { id: 2, invoice_no: 'SI-000002', date: '2026-06-20', customer_id: 1, employee_id: 2, status: 'draft', subtotal: 10400, discount: 0, tax_rate: 14, tax_amount: 1456, total: 11856, paid: 0, remaining: 11856, items: [
    { item_id: 3, name: 'أكياس بلاستيك 30×40', quantity: 2000, price: 2.5, discount: 0, total: 5000 },
    { item_id: 4, name: 'عبوات PET 500ml', quantity: 3000, price: 1.8, discount: 0, total: 5400 },
  ]},
];

const emptyItem = { item_id: '', quantity: '', price: '', discount: 0 };

export default function SalesInvoicePage() {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ customer_id: '', employee_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] });

  const filtered = invoices.filter(inv => {
    const cust = mockCustomers.find(c => c.id === inv.customer_id);
    const matchSearch = !search || inv.invoice_no.includes(search) || cust?.name.includes(search);
    const matchStatus = !filterStatus || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getCustomerName = (id) => mockCustomers.find(c => c.id === id)?.name || '-';
  const getEmployeeName = (id) => mockEmployees.find(e => e.id === id)?.name || '-';

  const openAdd = () => {
    setEditing(null);
    setForm({ customer_id: '', employee_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] });
    setShowModal(true);
  };

  const updateFormItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'item_id') {
      const item = mockItems.find(i => i.id === Number(value));
      if (item) items[idx].price = item.price;
    }
    setForm({ ...form, items });
  };

  const addFormItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeFormItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const calcSubtotal = () => form.items.reduce((sum, i) => sum + ((Number(i.quantity) || 0) * (Number(i.price) || 0) - Number(i.discount || 0)), 0);
  const calcTax = () => (calcSubtotal() - Number(form.discount || 0)) * (Number(form.tax_rate) || 0) / 100;
  const calcTotal = () => calcSubtotal() - Number(form.discount || 0) + calcTax();

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');

    const invoiceItems = form.items.map(i => {
      const item = mockItems.find(m => m.id === Number(i.item_id));
      const qty = Number(i.quantity), prc = Number(i.price), disc = Number(i.discount || 0);
      return { item_id: Number(i.item_id), name: item?.name || '', quantity: qty, price: prc, discount: disc, total: qty * prc - disc };
    });

    const subtotal = calcSubtotal(), disc = Number(form.discount || 0), taxAmt = calcTax(), total = calcTotal(), paid = Number(form.paid || 0);

    if (editing) {
      setInvoices(invoices.map(inv => inv.id === editing.id ? { ...inv, customer_id: Number(form.customer_id), employee_id: Number(form.employee_id) || null, date: form.date, subtotal, discount: disc, tax_rate: Number(form.tax_rate), tax_amount: Math.round(taxAmt), total: Math.round(total), paid, remaining: Math.round(total) - paid, items: invoiceItems } : inv));
      toast.success('تم تحديث الفاتورة');
    } else {
      setInvoices([{
        id: Date.now(), invoice_no: `SI-${String(invoices.length + 1).padStart(6, '0')}`,
        customer_id: Number(form.customer_id), employee_id: Number(form.employee_id) || null,
        date: form.date, status: 'draft', subtotal, discount: disc,
        tax_rate: Number(form.tax_rate), tax_amount: Math.round(taxAmt),
        total: Math.round(total), paid, remaining: Math.round(total) - paid, items: invoiceItems
      }, ...invoices]);
      toast.success('تمت إضافة الفاتورة');
    }
    setShowModal(false);
  };

  const handlePost = (id) => {
    if (!window.confirm('ترحيل الفاتورة؟ سيتم خصم المخزون وتحديث رصيد العميل.')) return;
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status: 'posted' } : inv));
    toast.success('تم ترحيل الفاتورة');
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذه الفاتورة؟')) return;
    setInvoices(invoices.filter(inv => inv.id !== id));
    setSelectedIds(selectedIds.filter(sid => sid !== id));
    toast.success('تم حذف الفاتورة');
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(i => i.id));

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`حذف ${selectedIds.length} فاتورة؟ سيتم عكس تأثيرها على المخزون والأرصدة.`)) return;
    setInvoices(invoices.filter(inv => !selectedIds.includes(inv.id)));
    setSelectedIds([]);
    toast.success(`تم حذف ${selectedIds.length} فاتورة`);
  };

  const handlePrint = (inv) => {
    const cust = getCustomerName(inv.customer_id);
    const emp = getEmployeeName(inv.employee_id);
    const printContent = `
      <html dir="rtl"><head><title>فاتورة ${inv.invoice_no}</title>
      <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}
      h1{font-size:22px;text-align:center;margin-bottom:5px}
      .info{display:flex;justify-content:space-between;margin:20px 0;font-size:14px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #333;padding:8px;text-align:right}
      th{background:#f0f0f0}.totals{margin-top:15px;text-align:left;font-size:14px}
      .totals div{margin:4px 0}.total-line{font-size:18px;font-weight:bold}
      </style></head><body>
      <h1>فاتورة بيع آجل</h1>
      <p style="text-align:center;color:#666">${inv.invoice_no} — ${inv.status === 'posted' ? 'مرحّلة' : 'مسودة'}</p>
      <div class="info"><span>العميل: <strong>${cust}</strong></span><span>المندوب: ${emp}</span><span>التاريخ: ${inv.date}</span></div>
      <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
      <tbody>${inv.items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.name}</td><td>${item.quantity.toLocaleString()}</td><td>${item.price}</td><td>${item.discount}</td><td>${item.total.toLocaleString()}</td></tr>`).join('')}</tbody></table>
      <div class="totals">
        <div>إجمالي الأصناف: ${inv.subtotal.toLocaleString()} ج.م</div>
        <div>الخصم: ${inv.discount.toLocaleString()} ج.م</div>
        <div>الضريبة (${inv.tax_rate}%): ${inv.tax_amount.toLocaleString()} ج.م</div>
        <div class="total-line">الإجمالي: ${inv.total.toLocaleString()} ج.م</div>
        <div>المدفوع: ${inv.paid.toLocaleString()} ج.م | المتبقي: ${inv.remaining.toLocaleString()} ج.م</div>
      </div></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">مبيعات آجل</h1>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <button onClick={handleBulkDelete} className="erp-btn erp-btn-danger flex items-center gap-1">
              <MdDeleteSweep size={20} /> حذف المحدد ({selectedIds.length})
            </button>
          )}
          <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> فاتورة جديدة</button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
          <input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="erp-input w-auto min-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="posted">مرحّلة</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th>
              <th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>المندوب</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>}
            {filtered.map(inv => (
              <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'bg-blue-50' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} /></td>
                <td className="font-mono text-sm">{inv.invoice_no}</td>
                <td>{inv.date}</td>
                <td className="font-medium">{getCustomerName(inv.customer_id)}</td>
                <td className="text-sm text-gray-600">{getEmployeeName(inv.employee_id)}</td>
                <td className="font-bold">{inv.total.toLocaleString()} ج.م</td>
                <td className="text-green-600">{inv.paid.toLocaleString()}</td>
                <td className={inv.remaining > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{inv.remaining.toLocaleString()}</td>
                <td>{inv.status === 'draft' ? <span className="badge badge-yellow">مسودة</span> : <span className="badge badge-green">مرحّلة</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {inv.status === 'draft' && (
                      <button onClick={() => handlePost(inv.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1" title="ترحيل">
                        <MdCheckCircle size={14} /> ترحيل
                      </button>
                    )}
                    <button onClick={() => handlePrint(inv)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdPrint size={14} /></button>
                    <button onClick={() => handleDelete(inv.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل فاتورة بيع' : 'فاتورة بيع جديدة'} onClose={() => setShowModal(false)} width="max-w-3xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">العميل *</label>
                <select className="erp-input" required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {mockCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">المندوب</label>
                <select className="erp-input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">— بدون —</option>
                  {mockEmployees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.commission_rate}%)</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">التاريخ *</label>
                <input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">الأصناف</label>
                <button type="button" onClick={addFormItem} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button>
              </div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>خصم الصنف</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>
                  {form.items.map((item, idx) => {
                    const lineTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0) - Number(item.discount || 0);
                    return (
                      <tr key={idx}>
                        <td>
                          <select className="erp-input py-1" value={item.item_id} onChange={e => updateFormItem(idx, 'item_id', e.target.value)}>
                            <option value="">اختر صنف</option>
                            {mockItems.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                          </select>
                        </td>
                        <td><input type="number" className="erp-input py-1 w-20" value={item.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)} /></td>
                        <td><input type="number" step="0.01" className="erp-input py-1 w-20" value={item.price} onChange={e => updateFormItem(idx, 'price', e.target.value)} /></td>
                        <td><input type="number" className="erp-input py-1 w-20" value={item.discount} onChange={e => updateFormItem(idx, 'discount', e.target.value)} /></td>
                        <td className="font-bold">{lineTotal.toLocaleString()}</td>
                        <td>{form.items.length > 1 && <button type="button" onClick={() => removeFormItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="form-label">خصم الفاتورة</label>
                <input type="number" className="erp-input" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
              </div>
              <div>
                <label className="form-label">نسبة الضريبة %</label>
                <input type="number" className="erp-input" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div>
                <label className="form-label">المدفوع</label>
                <input type="number" className="erp-input" value={form.paid} onChange={e => setForm({ ...form, paid: e.target.value })} />
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-gray-500">إجمالي: {calcSubtotal().toLocaleString()}</p>
                <p className="text-xs text-gray-500">ضريبة: {Math.round(calcTax()).toLocaleString()}</p>
                <p className="text-lg font-bold text-primary">{Math.round(calcTotal()).toLocaleString()} ج.م</p>
              </div>
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

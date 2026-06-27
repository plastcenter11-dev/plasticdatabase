import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdCheckCircle, MdDeleteSweep } from 'react-icons/md';

const mockSuppliers = [
  { id: 1, name: 'شركة البترول للبتروكيماويات' },
  { id: 2, name: 'مصنع الخليج للبلاستيك' },
];
const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', price: 40, unit: 'كيلو' },
  { id: 2, code: 'RM-002', name: 'بولي بروبيلين', price: 48, unit: 'كيلو' },
  { id: 5, code: 'SP-001', name: 'ألوان صناعية', price: 100, unit: 'كيلو' },
];

const initialInvoices = [
  { id: 1, invoice_no: 'PI-000001', date: '2026-06-10', supplier_id: 1, status: 'posted', subtotal: 40000, discount: 0, tax_rate: 14, tax_amount: 5600, total: 45600, paid: 45600, remaining: 0, items: [
    { item_id: 1, name: 'بولي إيثيلين عالي الكثافة', quantity: 1000, price: 40, discount: 0, total: 40000 },
  ]},
  { id: 2, invoice_no: 'PI-000002', date: '2026-06-18', supplier_id: 2, status: 'draft', subtotal: 14400, discount: 400, tax_rate: 14, tax_amount: 1960, total: 15960, paid: 0, remaining: 15960, items: [
    { item_id: 2, name: 'بولي بروبيلين', quantity: 300, price: 48, discount: 0, total: 14400 },
  ]},
];

const emptyItem = { item_id: '', quantity: '', price: '', discount: 0 };

export default function PurchaseInvoicePage() {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ supplier_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] });

  const filtered = invoices.filter(inv => {
    const sup = mockSuppliers.find(s => s.id === inv.supplier_id);
    const matchSearch = !search || inv.invoice_no.includes(search) || sup?.name.includes(search);
    const matchStatus = !filterStatus || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getSupplierName = (id) => mockSuppliers.find(s => s.id === id)?.name || '-';

  const openAdd = () => {
    setEditing(null);
    setForm({ supplier_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] });
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
    if (!form.supplier_id) return toast.error('اختر المورد');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');

    const invoiceItems = form.items.map(i => {
      const item = mockItems.find(m => m.id === Number(i.item_id));
      const qty = Number(i.quantity), prc = Number(i.price), disc = Number(i.discount || 0);
      return { item_id: Number(i.item_id), name: item?.name || '', quantity: qty, price: prc, discount: disc, total: qty * prc - disc };
    });

    const subtotal = calcSubtotal(), disc = Number(form.discount || 0), taxAmt = calcTax(), total = calcTotal(), paid = Number(form.paid || 0);

    if (editing) {
      setInvoices(invoices.map(inv => inv.id === editing.id ? { ...inv, supplier_id: Number(form.supplier_id), date: form.date, subtotal, discount: disc, tax_rate: Number(form.tax_rate), tax_amount: Math.round(taxAmt), total: Math.round(total), paid, remaining: Math.round(total) - paid, items: invoiceItems } : inv));
      toast.success('تم تحديث الفاتورة');
    } else {
      setInvoices([{
        id: Date.now(), invoice_no: `PI-${String(invoices.length + 1).padStart(6, '0')}`,
        supplier_id: Number(form.supplier_id), date: form.date, status: 'draft', subtotal, discount: disc,
        tax_rate: Number(form.tax_rate), tax_amount: Math.round(taxAmt),
        total: Math.round(total), paid, remaining: Math.round(total) - paid, items: invoiceItems
      }, ...invoices]);
      toast.success('تمت إضافة الفاتورة');
    }
    setShowModal(false);
  };

  const handlePost = (id) => {
    if (!window.confirm('ترحيل الفاتورة؟ سيتم إضافة المخزون وتحديث رصيد المورد.')) return;
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
    if (!window.confirm(`حذف ${selectedIds.length} فاتورة؟`)) return;
    setInvoices(invoices.filter(inv => !selectedIds.includes(inv.id)));
    setSelectedIds([]);
    toast.success(`تم حذف ${selectedIds.length} فاتورة`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">فواتير الشراء</h1>
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
              <th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>}
            {filtered.map(inv => (
              <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'bg-blue-50' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} /></td>
                <td className="font-mono text-sm">{inv.invoice_no}</td>
                <td>{inv.date}</td>
                <td className="font-medium">{getSupplierName(inv.supplier_id)}</td>
                <td className="font-bold">{inv.total.toLocaleString()} ج.م</td>
                <td className="text-green-600">{inv.paid.toLocaleString()}</td>
                <td className={inv.remaining > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{inv.remaining.toLocaleString()}</td>
                <td>{inv.status === 'draft' ? <span className="badge badge-yellow">مسودة</span> : <span className="badge badge-green">مرحّلة</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {inv.status === 'draft' && (
                      <button onClick={() => handlePost(inv.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1"><MdCheckCircle size={14} /> ترحيل</button>
                    )}
                    <button onClick={() => handleDelete(inv.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة'} onClose={() => setShowModal(false)} width="max-w-3xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">المورد *</label>
                <select className="erp-input" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {mockSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>خصم</th><th>الإجمالي</th><th></th></tr></thead>
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

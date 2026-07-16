import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';

const emptyItem = { item_id: '', name: '', quantity: '', weight: '', price: '', total: 0 };

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 });

  const loadData = async () => {
    try {
      const [r, s] = await Promise.all([api.get('/returns/purchase'), api.get('/suppliers')]);
      setReturns(r.data); setSuppliers(s.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const filtered = returns.filter(r => {
    if (!search) return true;
    return r.return_no?.includes(search) || r.Supplier?.name?.includes(search);
  });

  const handleSupplierChange = async (supplierId) => {
    setForm({ ...form, supplier_id: supplierId, invoice_id: '', items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 });
    if (supplierId) {
      try {
        const { data } = await api.get(`/purchase-invoices/supplier/${supplierId}`);
        setPurchaseInvoices(data);
      } catch { setPurchaseInvoices([]); }
    } else { setPurchaseInvoices([]); }
  };

  const handleInvoiceChange = (invoiceId) => {
    const inv = purchaseInvoices.find(i => i.id === Number(invoiceId));
    if (inv) {
      const mapped = (inv.items || []).map(i => ({
        item_id: i.item_id,
        name: i.Item?.name || '-',
        quantity: Number(i.quantity) || 0,
        weight: Number(i.weight) || 0,
        price: Number(i.price),
        max_qty: Number(i.quantity),
        max_weight: Number(i.weight) || 0,
        total: (Number(i.weight) || 0) * Number(i.price),
      }));
      const items = mapped.length > 0 ? mapped : [{ ...emptyItem }];
      setForm({ ...form, invoice_id: invoiceId, items, invoice_tax_rate: Number(inv.tax_rate) || 0, invoice_discount: Number(inv.discount) || 0, invoice_subtotal: Number(inv.subtotal) || 0 });
    } else { setForm({ ...form, invoice_id: invoiceId, items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 }); }
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    items[idx].total = (Number(items[idx].weight) || 0) * (Number(items[idx].price) || 0);
    setForm({ ...form, items });
  };

  const calcSubtotal = () => form.items.reduce((sum, i) => sum + (i.total || 0), 0);
  const calcProportionalDiscount = () => form.invoice_subtotal > 0 ? form.invoice_discount * (calcSubtotal() / form.invoice_subtotal) : 0;
  const calcTax = () => (calcSubtotal() - calcProportionalDiscount()) * (form.invoice_tax_rate / 100);
  const calcTotal = () => calcSubtotal() - calcProportionalDiscount() + calcTax();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.supplier_id) return toast.error('اختر المورد');
    const validItems = form.items.filter(i => Number(i.quantity) > 0);
    if (!validItems.length) return toast.error('أدخل كمية المرتجع');
    try {
      await api.post('/returns/purchase', {
        supplier_id: Number(form.supplier_id), invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
        date: form.date, reason: form.reason,
        items: validItems.map(i => ({ item_id: i.item_id, quantity: Number(i.quantity), weight: Number(i.weight || 0), price: Number(i.price) }))
      });
      toast.success('تم تسجيل مرتجع المشتريات');
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا المرتجع؟')) return;
    try { await api.delete(`/returns/purchase/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">مرتجع مشتريات</h1>
        <button onClick={() => { setForm({ supplier_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 }); setPurchaseInvoices([]); setShowModal(true); }}
          className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مرتجع جديد</button>
      </div>

      <div className="page-card">
        <div className="relative max-w-md mb-4"><MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} /><input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="erp-table">
            <thead><tr><th>رقم المرتجع</th><th>التاريخ</th><th>المورد</th><th>الأصناف</th><th>الإجمالي</th><th>السبب</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>}
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-sm">{r.return_no}</td>
                  <td>{r.date}</td>
                  <td className="font-medium">{r.Supplier?.name || '-'}</td>
                  <td>{(r.items || []).map((item, i) => <div key={i} className="text-sm">{item.Item?.name || '-'} — {Number(item.quantity)} × {Number(item.price)} ج.م</div>)}</td>
                  <td className="font-bold text-red-600">{Number(r.total).toLocaleString()} ج.م</td>
                  <td className="text-sm text-gray-500">{r.reason || '-'}</td>
                  <td><button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
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
              <div><label className="form-label">المورد *</label><select className="erp-input" required value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)}><option value="">— اختر —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="form-label">فاتورة الشراء</label><select className="erp-input" value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}><option value="">— اختر —</option>{purchaseInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no} ({inv.date})</option>)}</select></div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div><label className="form-label">سبب المرتجع</label><input className="erp-input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <div>
              <label className="form-label mb-2">الأصناف المرتجعة</label>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الوزن المشترى</th><th>العدد المشترى</th><th>الوزن المرتجع</th><th>العدد المرتجع</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>{form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{item.name || '—'}</td>
                    <td className="text-gray-500">{Number(item.max_weight || 0).toLocaleString()} كجم</td>
                    <td className="text-gray-500">{item.max_qty || '-'}</td>
                    <td><input type="number" step="0.01" min="0" className="erp-input py-1 w-24" value={item.weight} onChange={e => updateItem(idx, 'weight', e.target.value)} /></td>
                    <td><input type="number" min="0" className="erp-input py-1 w-20" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                    <td>{Number(item.price || 0).toLocaleString()} ج.م</td>
                    <td className="font-bold">{(item.total || 0).toLocaleString()} ج.م</td>
                  </tr>
                ))}</tbody>
              </table>
              {(form.invoice_discount > 0 || form.invoice_tax_rate > 0) && (
                <div className="flex gap-6 justify-end text-sm border-t pt-3 mt-2">
                  <span>إجمالي قبل الخصم: <strong>{calcSubtotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  {form.invoice_discount > 0 && <span className="text-red-500">الخصم: <strong>- {calcProportionalDiscount().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>}
                  {form.invoice_tax_rate > 0 && <span className="text-green-600">الضريبة ({form.invoice_tax_rate}%): <strong>+ {calcTax().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>}
                </div>
              )}
              <div className="text-left mt-2 text-lg font-bold text-red-600">إجمالي المرتجع: {calcTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>
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

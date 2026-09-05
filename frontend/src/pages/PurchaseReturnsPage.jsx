import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdSearch, MdPrint, MdKeyboardArrowDown, MdKeyboardArrowLeft } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyItem = { item_id: '', name: '', quantity: '', weight: '', price: '', discount: 0, total: 0 };

export default function PurchaseReturnsPage() {
  const { can } = useAuth();
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
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

  // Per-unit "effective" price for a returned item, folding in that item's
  // proportional share of the original invoice's header-level discount and
  // tax (the same allocation the invoice's own POST /:id/post uses) - so
  // returning goods from a discounted/taxed invoice reverses exactly what
  // the invoice actually charged for them, not the pre-discount line price.
  const effectiveUnitNet = (i, inv, grossTotal) => {
    const unit = (Number(i.weight) || 0) > 0 ? Number(i.weight) : Number(i.quantity) || 0;
    if (unit <= 0) return 0;
    const pr = Number(i.price) || 0;
    const disc = Number(i.discount) || 0;
    const itemGross = unit * pr;
    const itemNet = itemGross * (1 - disc / 100);
    const taxShare = grossTotal > 0 ? Number(inv.tax_amount || 0) * (itemGross / grossTotal) : 0;
    const discShare = Number(inv.subtotal || 0) > 0 ? Number(inv.discount || 0) * (itemNet / Number(inv.subtotal)) : 0;
    return (itemNet - discShare + taxShare) / unit;
  };

  const handleInvoiceChange = (invoiceId) => {
    const inv = purchaseInvoices.find(i => i.id === Number(invoiceId));
    if (inv) {
      const grossTotal = (inv.items || []).reduce((s, i) => s + ((Number(i.weight) || 0) > 0 ? Number(i.weight) : Number(i.quantity) || 0) * Number(i.price || 0), 0);
      const mapped = (inv.items || []).map(i => {
        const wt = Number(i.weight) || 0;
        const pr = Number(i.price) || 0;
        const disc = Number(i.discount) || 0;
        const unitNet = effectiveUnitNet(i, inv, grossTotal);
        return {
          item_id: i.item_id,
          name: i.Item?.name || '-',
          quantity: Number(i.quantity) || 0,
          weight: wt,
          price: pr,
          discount: disc,
          unitNet,
          max_qty: Number(i.quantity),
          max_weight: wt,
          total: unitNet * (wt > 0 ? wt : Number(i.quantity) || 0),
        };
      });
      const items = mapped.length > 0 ? mapped : [{ ...emptyItem }];
      setForm({ ...form, invoice_id: invoiceId, items, invoice_tax_rate: Number(inv.tax_rate) || 0, invoice_discount: Number(inv.discount) || 0, invoice_subtotal: Number(inv.subtotal) || 0 });
    } else { setForm({ ...form, invoice_id: invoiceId, items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 }); }
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    const wt = Number(items[idx].weight) || 0;
    const qty = Number(items[idx].quantity) || 0;
    const pr = Number(items[idx].price) || 0;
    const disc = Number(items[idx].discount) || 0;
    if (form.invoice_id && items[idx].unitNet != null) {
      // Linked to an invoice: total scales with the effective per-unit price
      // computed once when the invoice was selected (already nets out that
      // item's share of the invoice's discount and tax).
      items[idx].total = items[idx].unitNet * (wt > 0 ? wt : qty);
    } else {
      items[idx].total = wt > 0 ? wt * pr * (1 - disc / 100) : qty * pr * (1 - disc / 100);
    }
    setForm({ ...form, items });
  };

  const calcSubtotal = () => form.items.reduce((sum, i) => sum + (i.total || 0), 0);
  // When linked to an invoice, each item's total already has its share of
  // discount/tax folded in - the tax shown here is informational only and
  // must NOT be added again on top of the subtotal.
  const calcTax = () => form.invoice_id ? 0 : calcSubtotal() * (form.invoice_tax_rate / 100);
  const calcTotal = () => calcSubtotal() + calcTax();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.supplier_id) return toast.error('اختر المورد');
    const validItems = form.items.filter(i => Number(i.quantity) > 0);
    if (!validItems.length) return toast.error('أدخل كمية المرتجع');
    try {
      await api.post('/returns/purchase', {
        supplier_id: Number(form.supplier_id), invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
        date: form.date, reason: form.reason,
        tax_rate: Number(form.invoice_tax_rate),
        tax_amount: calcTax(),
        total: calcTotal(),
        items: validItems.map(i => ({ item_id: i.item_id, quantity: Number(i.quantity), weight: Number(i.weight || 0), price: Number(i.price), discount: Number(i.discount || 0), total: Number(i.total || 0) }))
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

  const handlePrint = (r) => {
    const sup = r.Supplier?.name || '-';
    const retItems = r.items || [];
    const printContent = `<html dir="rtl"><head><title>مرتجع شراء ${r.return_no}</title>
    <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:22px;text-align:center}
    .info{display:flex;justify-content:space-between;margin:20px 0;font-size:14px}
    table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:8px;text-align:right}
    th{background:#f0f0f0}.totals{margin-top:15px;text-align:left;font-size:14px}.totals div{margin:4px 0}.total-line{font-size:18px;font-weight:bold}</style></head><body>
    <h1>مرتجع مشتريات</h1>
    <div class="info"><span>المورد: <strong>${sup}</strong></span><span>التاريخ: ${r.date}</span></div>
    <table><thead><tr><th>#</th><th>الصنف</th><th>الوزن (كجم)</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>${retItems.map((item, i) => `<tr><td>${i+1}</td><td>${item.Item?.name || '-'}</td><td>${Number(item.weight || 0) > 0 ? Number(item.weight).toLocaleString() : '—'}</td><td>${Number(item.quantity).toLocaleString()}</td><td>${item.price}</td><td>${Number(item.total).toLocaleString()}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div class="total-line">الإجمالي: ${Number(r.total).toLocaleString()} ج.م</div></div></body></html>`;
    const win = window.open('', '_blank'); win.document.write(printContent); win.document.close(); win.print();
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">مرتجع مشتريات</h1>
        {can('purchase_invoices', 'create') && <button onClick={() => { setForm({ supplier_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }], invoice_tax_rate: 0, invoice_discount: 0, invoice_subtotal: 0 }); setPurchaseInvoices([]); setShowModal(true); }}
          className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مرتجع جديد</button>}
      </div>

      <div className="page-card">
        <div className="relative max-w-md mb-4"><MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} /><input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="erp-table">
            <thead><tr><th style={{width:'28px'}}></th><th>رقم المرتجع</th><th>التاريخ</th><th>المورد</th><th>الفاتورة</th><th>الإجمالي</th><th>السبب</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>}
              {filtered.map(r => [
                <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                  <td className="text-center text-gray-400">{expanded.has(r.id) ? <MdKeyboardArrowDown size={18} /> : <MdKeyboardArrowLeft size={18} />}</td>
                  <td className="font-mono text-sm">{r.return_no}</td>
                  <td>{r.date}</td>
                  <td className="font-medium">{r.Supplier?.name || '-'}</td>
                  <td className="text-sm text-blue-600 font-mono">{r.PurchaseInvoice?.invoice_no || (r.invoice_id ? `#${r.invoice_id}` : '-')}</td>
                  <td className="font-bold text-red-600">{Number(r.total).toLocaleString()} ج.م</td>
                  <td className="text-sm text-gray-500">{r.reason || '-'}</td>
                  <td onClick={e => e.stopPropagation()} className="flex gap-1">
                    <button onClick={() => handlePrint(r)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdPrint size={14} /></button>
                    {can('purchase_invoices', 'delete') && <button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </td>
                </tr>,
                expanded.has(r.id) && (r.items || []).length > 0 && (
                  <tr key={`sub-${r.id}`}>
                    <td colSpan={8} className="p-0">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-red-50"><td></td><th className="py-1 px-3 text-right font-semibold text-gray-600">الصنف</th><th className="py-1 px-3 text-right font-semibold text-gray-600">الوزن</th><th className="py-1 px-3 text-right font-semibold text-gray-600">العدد</th><th className="py-1 px-3 text-right font-semibold text-gray-600">السعر</th><th className="py-1 px-3 text-right font-semibold text-gray-600">الإجمالي</th></tr></thead>
                        <tbody>
                          {r.items.map((it, j) => (
                            <tr key={j} className="bg-red-50/40 border-t border-red-100">
                              <td className="w-8"></td>
                              <td className="py-1 px-3">{it.Item?.name || it.item_id}</td>
                              <td className="py-1 px-3">{Number(it.weight || 0) > 0 ? `${Number(it.weight).toLocaleString()} كجم` : '-'}</td>
                              <td className="py-1 px-3">{Number(it.quantity).toLocaleString()}</td>
                              <td className="py-1 px-3">{Number(it.price).toLocaleString()}</td>
                              <td className="py-1 px-3 font-medium">{Number(it.total).toLocaleString()} ج.م</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="مرتجع مشتريات جديد" onClose={() => setShowModal(false)} width="max-w-3xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">المورد *</label><SearchableSelect className="erp-input" required value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)}><option value="">— اختر —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</SearchableSelect></div>
              <div><label className="form-label">فاتورة الشراء</label><SearchableSelect className="erp-input" value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}><option value="">— اختر —</option>{purchaseInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no} ({inv.date})</option>)}</SearchableSelect></div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">سبب المرتجع</label><input className="erp-input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <div>
                <label className="form-label">نسبة الضريبة %</label>
                {form.invoice_id
                  ? <div className="erp-input bg-gray-50 text-gray-700">{form.invoice_tax_rate}%</div>
                  : <input type="number" min="0" max="100" className="erp-input" value={form.invoice_tax_rate} onChange={e => setForm({ ...form, invoice_tax_rate: Number(e.target.value) })} />
                }
              </div>
            </div>
            <div>
              <label className="form-label mb-2">الأصناف المرتجعة</label>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الوزن المشترى</th><th>العدد المشترى</th><th>الوزن المرتجع</th><th>العدد المرتجع</th><th>السعر</th><th>خصم %</th><th>الإجمالي</th></tr></thead>
                <tbody>{form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{item.name || '—'}</td>
                    <td className="text-gray-500">{Number(item.max_weight || 0).toLocaleString()} كجم</td>
                    <td className="text-gray-500">{item.max_qty || '-'}</td>
                    <td><input type="number" step="0.01" min="0" className="erp-input py-1 w-24" value={item.weight} onChange={e => updateItem(idx, 'weight', e.target.value)} /></td>
                    <td><input type="number" min="0" className="erp-input py-1 w-20" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                    <td>{Number(item.price || 0).toLocaleString()} ج.م</td>
                    <td>{form.invoice_id ? <span className="text-gray-700">{Number(item.discount || 0)}%</span> : <input type="number" min="0" max="100" className="erp-input py-1 w-16" value={item.discount} onChange={e => updateItem(idx, 'discount', e.target.value)} />}</td>
                    <td className="font-bold">{(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</td>
                  </tr>
                ))}</tbody>
              </table>
              {form.invoice_id ? (
                <div className="text-sm text-gray-500 border-t pt-3 mt-2 text-left">شامل الضريبة والخصم بنفس نسبتهما في الفاتورة الأصلية</div>
              ) : form.invoice_tax_rate > 0 && (
                <div className="flex gap-6 justify-end text-sm border-t pt-3 mt-2">
                  <span>إجمالي قبل الضريبة: <strong>{calcSubtotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span className="text-green-600">الضريبة ({form.invoice_tax_rate}%): <strong>+ {calcTax().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>
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

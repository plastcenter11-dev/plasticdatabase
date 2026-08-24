import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdSearch, MdKeyboardArrowDown, MdKeyboardArrowLeft } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyItem = { item_id: '', quantity: '', weight: '', price: '', discount: 0, total: 0 };

export default function SalesReturnsPage() {
  const { can } = useAuth();
  const [returns, setReturns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customer_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', tax_rate: 0, items: [{ ...emptyItem }] });

  const loadData = async () => {
    try {
      const [r, c, it] = await Promise.all([api.get('/returns/sales'), api.get('/customers'), api.get('/items')]);
      setReturns(r.data); setCustomers(c.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const handleCustomerChange = async (custId) => {
    setForm(f => ({ ...f, customer_id: custId, invoice_id: '', items: [{ ...emptyItem }] }));
    if (custId) {
      try {
        const r = await api.get('/sales-invoices');
        setSalesInvoices(r.data.filter(i => i.customer_id === Number(custId) && i.status === 'posted'));
      } catch { setSalesInvoices([]); }
    } else setSalesInvoices([]);
  };

  const handleInvoiceChange = async (invId) => {
    if (!invId) { setForm(f => ({ ...f, invoice_id: '', items: [{ ...emptyItem }] })); return; }
    setForm(f => ({ ...f, invoice_id: invId }));
    try {
      const r = await api.get(`/sales-invoices/${invId}`);
      const mapped = (r.data.items || []).map(i => ({
        item_id: i.item_id,
        quantity: i.quantity,
        weight: i.weight || '',
        price: i.price,
        discount: i.discount || 0,
        total: Number(i.weight || 0) > 0
          ? Number(i.weight) * Number(i.price) * (1 - Number(i.discount || 0) / 100)
          : Number(i.quantity) * Number(i.price) - Number(i.discount || 0),
      }));
      const inv = r.data;
      setForm(f => ({ ...f, invoice_id: invId, tax_rate: Number(inv.tax_rate || 0), items: mapped.length > 0 ? mapped : [{ ...emptyItem }] }));
    } catch { }
  };

  const updateItem = (idx, field, val) => {
    const its = [...form.items];
    its[idx] = { ...its[idx], [field]: val };
    const wt = Number(its[idx].weight || 0);
    const qty = Number(its[idx].quantity || 0);
    const pr = Number(its[idx].price || 0);
    const disc = Number(its[idx].discount || 0);
    its[idx].total = wt > 0 ? wt * pr * (1 - disc / 100) : qty * pr * (1 - disc / 100);
    setForm(f => ({ ...f, items: its }));
  };

  const calcSubtotal = () => form.items.reduce((s, i) => s + Number(i.total || 0), 0);
  const calcTax = () => calcSubtotal() * (Number(form.tax_rate) / 100);
  const calcTotal = () => calcSubtotal() + calcTax();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');
    try {
      const taxAmt = calcTax();
      await api.post('/returns/sales', {
        ...form,
        customer_id: Number(form.customer_id),
        invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
        tax_rate: Number(form.tax_rate),
        tax_amount: taxAmt,
        total: calcTotal(),
        items: form.items.map(i => ({ ...i, item_id: Number(i.item_id), quantity: Number(i.quantity), weight: Number(i.weight || 0), price: Number(i.price), discount: Number(i.discount || 0), total: Number(i.total || 0) })),
      });
      toast.success('تم حفظ المرتجع'); setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا المرتجع؟')) return;
    try { await api.delete(`/returns/sales/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const filtered = returns.filter(r => !search || r.return_no?.includes(search) || r.Customer?.name?.includes(search));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">مرتجع مبيعات</h1>
        {can('sales_invoices', 'create') && <button onClick={() => { setForm({ customer_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', tax_rate: 0, items: [{ ...emptyItem }] }); setSalesInvoices([]); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مرتجع جديد</button>}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث برقم المرتجع أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="erp-table">
          <thead><tr><th style={{width:'28px'}}></th><th>رقم المرتجع</th><th>التاريخ</th><th>العميل</th><th>الفاتورة</th><th>الإجمالي</th><th>السبب</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>}
            {filtered.map(r => [
              <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                <td className="text-center text-gray-400">{expanded.has(r.id) ? <MdKeyboardArrowDown size={18} /> : <MdKeyboardArrowLeft size={18} />}</td>
                <td className="font-mono text-sm">{r.return_no}</td>
                <td>{r.date}</td>
                <td className="font-medium">{r.Customer?.name || '-'}</td>
                <td className="text-sm text-blue-600 font-mono">{r.SalesInvoice?.invoice_no || (r.invoice_id ? `#${r.invoice_id}` : '-')}</td>
                <td className="font-bold text-red-600">{Number(r.total).toLocaleString()} ج.م</td>
                <td className="text-sm text-gray-500">{r.reason || '-'}</td>
                <td onClick={e => e.stopPropagation()}>{can('sales_invoices', 'delete') && <button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}</td>
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

      {showModal && (
        <Modal title="مرتجع مبيعات جديد" onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">العميل *</label>
                <SearchableSelect className="erp-input" required value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)}>
                  <option value="">— اختر العميل —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SearchableSelect>
              </div>
              <div>
                <label className="form-label">الفاتورة (اختياري)</label>
                <SearchableSelect className="erp-input" value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}>
                  <option value="">— بدون فاتورة —</option>
                  {salesInvoices.map(i => <option key={i.id} value={i.id}>{i.invoice_no} — {Number(i.total).toLocaleString()} ج.م</option>)}
                </SearchableSelect>
              </div>
              <div>
                <label className="form-label">التاريخ *</label>
                <input type="date" className="erp-input" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">السبب</label>
                <input type="text" className="erp-input" placeholder="سبب الإرجاع..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">نسبة الضريبة %</label>
                {form.invoice_id
                  ? <div className="erp-input bg-gray-50 text-gray-700">{form.tax_rate}%</div>
                  : <input type="number" min="0" max="100" className="erp-input" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} />
                }
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">الأصناف</label>
                {!form.invoice_id && <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button>}
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الوزن (كجم)</th>
                    <th>العدد</th>
                    <th>السعر</th>
                    <th>خصم %</th>
                    <th>الإجمالي</th>
                    {!form.invoice_id && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        {form.invoice_id
                          ? <span className="font-medium">{items.find(m => m.id === Number(item.item_id))?.name || item.item_id}</span>
                          : <SearchableSelect className="erp-input py-1" value={item.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)}>
                              <option value="">اختر صنف</option>
                              {items.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                            </SearchableSelect>
                        }
                      </td>
                      <td><input type="number" step="0.01" className="erp-input py-1 w-20" value={item.weight} onChange={e => updateItem(idx, 'weight', e.target.value)} /></td>
                      <td><input type="number" className="erp-input py-1 w-20" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                      <td>
                        {form.invoice_id
                          ? <span className="text-gray-700">{Number(item.price).toLocaleString()} ج.م</span>
                          : <input type="number" step="0.01" className="erp-input py-1 w-20" value={item.price} onChange={e => updateItem(idx, 'price', e.target.value)} />
                        }
                      </td>
                      <td>
                        {form.invoice_id
                          ? <span className="text-gray-700">{Number(item.discount || 0)}%</span>
                          : <input type="number" className="erp-input py-1 w-16" value={item.discount} onChange={e => updateItem(idx, 'discount', e.target.value)} />
                        }
                      </td>
                      <td className="font-bold">{Number(item.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      {!form.invoice_id && <td>{form.items.length > 1 && <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {Number(form.tax_rate) > 0 && (
                <div className="flex gap-6 justify-end text-sm border-t pt-3 mt-2">
                  <span>إجمالي قبل الضريبة: <strong>{calcSubtotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span className="text-green-600">الضريبة ({form.tax_rate}%): <strong>+ {calcTax().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>
                </div>
              )}
              <div className="text-left mt-2 text-lg font-bold text-primary">الإجمالي: {calcTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>
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

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdSearch, MdPrint } from 'react-icons/md';
import api from '../api/axios';

const emptyItem = { item_id: '', quantity: '', price: '', total: 0 };

export default function SalesReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customer_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }] });

  const loadData = async () => {
    try {
      const [r, c, it] = await Promise.all([api.get('/returns/sales'), api.get('/customers'), api.get('/items')]);
      setReturns(r.data); setCustomers(c.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const handleCustomerChange = async (custId) => {
    setForm(f => ({ ...f, customer_id: custId, invoice_id: '' }));
    if (custId) {
      try {
        const r = await api.get('/sales-invoices');
        setSalesInvoices(r.data.filter(i => i.customer_id === Number(custId) && i.status === 'posted'));
      } catch { setSalesInvoices([]); }
    } else setSalesInvoices([]);
  };

  const handleInvoiceChange = async (invId) => {
    setForm(f => ({ ...f, invoice_id: invId }));
    if (invId) {
      try {
        const r = await api.get(`/sales-invoices/${invId}`);
        setForm(f => ({ ...f, invoice_id: invId, items: (r.data.items || []).map(i => ({ item_id: i.item_id, quantity: i.quantity, price: i.price, total: i.total })) }));
      } catch { }
    }
  };

  const updateItem = (idx, field, val) => {
    const its = [...form.items];
    its[idx] = { ...its[idx], [field]: val };
    if (field === 'quantity' || field === 'price')
      its[idx].total = Number(its[idx].quantity || 0) * Number(its[idx].price || 0);
    setForm(f => ({ ...f, items: its }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');
    try {
      await api.post('/returns/sales', { ...form, customer_id: Number(form.customer_id), invoice_id: form.invoice_id ? Number(form.invoice_id) : null });
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
        <button onClick={() => { setForm({ customer_id: '', invoice_id: '', date: new Date().toISOString().split('T')[0], reason: '', items: [{ ...emptyItem }] }); setSalesInvoices([]); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> مرتجع جديد</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث برقم المرتجع أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="erp-table">
          <thead><tr><th>رقم المرتجع</th><th>التاريخ</th><th>العميل</th><th>الفاتورة</th><th>الإجمالي</th><th>السبب</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-sm">{r.return_no}</td>
                <td>{r.date}</td>
                <td className="font-medium">{r.Customer?.name || '-'}</td>
                <td className="text-sm text-gray-500">{r.invoice_id ? `#${r.invoice_id}` : '-'}</td>
                <td className="font-bold">{Number(r.total).toLocaleString()} ج.م</td>
                <td className="text-sm text-gray-500">{r.reason || '-'}</td>
                <td><button onClick={() => handleDelete(r.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="مرتجع مبيعات جديد" onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">العميل *</label>
                <select className="erp-input" required value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)}>
                  <option value="">— اختر العميل —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">الفاتورة (اختياري)</label>
                <select className="erp-input" value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}>
                  <option value="">— بدون فاتورة —</option>
                  {salesInvoices.map(i => <option key={i.id} value={i.id}>{i.invoice_no} — {Number(i.total).toLocaleString()} ج.م</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">التاريخ *</label>
                <input type="date" className="erp-input" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">السبب</label>
                <input type="text" className="erp-input" placeholder="سبب الإرجاع..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">الأصناف</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button>
              </div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="erp-input py-1" value={item.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)}>
                          <option value="">اختر صنف</option>
                          {items.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" className="erp-input py-1 w-24" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                      <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={item.price} onChange={e => updateItem(idx, 'price', e.target.value)} /></td>
                      <td className="font-bold">{Number(item.total).toLocaleString()}</td>
                      <td>{form.items.length > 1 && <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-left mt-2 text-lg font-bold text-primary">الإجمالي: {form.items.reduce((s, i) => s + Number(i.total || 0), 0).toLocaleString()} ج.م</div>
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

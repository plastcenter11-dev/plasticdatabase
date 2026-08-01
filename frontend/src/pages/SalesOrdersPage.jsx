import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdLocalShipping } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyItem = { item_id: '', quantity: '', price: '', tax_rate: '' };
const emptyCash = { enabled: false, amount: '', payment_method: 'نقدي', notes: '' };
const emptyCheck = { enabled: false, check_no: '', amount: '', due_date: '', bank_name: '' };

export default function SalesOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ customer_id: '', date: new Date().toISOString().split('T')[0], items: [{ ...emptyItem }] });
  const [cashForm, setCashForm] = useState({ ...emptyCash });
  const [checkForm, setCheckForm] = useState({ ...emptyCheck });

  const loadData = async () => {
    try {
      const [o, c, it] = await Promise.all([api.get('/sales-orders'), api.get('/customers'), api.get('/items')]);
      setOrders(o.data); setCustomers(c.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (location.state?.openNew) {
      setEditing(null);
      setForm({ customer_id: String(location.state.customerId || ''), date: new Date().toISOString().split('T')[0], items: [{ ...emptyItem }] });
      setCashForm({ ...emptyCash });
      setCheckForm({ ...emptyCheck });
      setShowModal(true);
      window.history.replaceState({}, '');
    }
  }, []);

  const filtered = orders.filter(o => {
    if (!search) return true;
    return o.order_no?.includes(search) || o.Customer?.name?.includes(search);
  });

  const statusBadge = (s) => {
    if (s === 'pending') return <span className="badge badge-yellow">قيد الانتظار</span>;
    if (s === 'delivered') return <span className="badge badge-green">تم التسليم</span>;
    return <span className="badge badge-red">ملغاة</span>;
  };

  const updateFormItem = (idx, field, value) => {
    const fitems = [...form.items];
    fitems[idx] = { ...fitems[idx], [field]: value };
    if (field === 'item_id') {
      const item = items.find(i => i.id === Number(value));
      if (item) fitems[idx].price = item.purchase_price;
    }
    setForm({ ...form, items: fitems });
  };

  const addFormItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeFormItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const calcItemTotal = (i) => Number(i.quantity || 0) * Number(i.price || 0) * (i.tax_rate ? 1 + Number(i.tax_rate) / 100 : 1);
  const calcTotal = () => form.items.reduce((sum, i) => sum + calcItemTotal(i), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');
    try {
      const payload = { customer_id: Number(form.customer_id), date: form.date, items: form.items.map(i => ({ item_id: Number(i.item_id), quantity: Number(i.quantity), price: Number(i.price), tax_rate: i.tax_rate ? Number(i.tax_rate) : null })) };
      if (editing) { await api.put(`/sales-orders/${editing.id}`, payload); toast.success('تم تحديث الطلبية'); }
      else {
        await api.post('/sales-orders', payload);
        if (cashForm.enabled && cashForm.amount) {
          await api.post('/finance/cash-receipts', { customer_id: Number(form.customer_id), amount: Number(cashForm.amount), payment_method: cashForm.payment_method, date: form.date, notes: cashForm.notes });
        }
        if (checkForm.enabled && checkForm.check_no && checkForm.amount) {
          await api.post('/finance/checks', { check_no: checkForm.check_no, party_type: 'customer', party_id: Number(form.customer_id), amount: Number(checkForm.amount), due_date: checkForm.due_date || form.date, bank_name: checkForm.bank_name, date: form.date });
        }
        toast.success('تمت إضافة الطلبية');
      }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذه الطلبية؟')) return;
    try { await api.delete(`/sales-orders/${id}`); toast.success('تم حذف الطلبية'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleConvertToDelivery = (order) => {
    navigate('/delivery-notes', { state: { openNew: true, customerId: order.customer_id } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">طلبيات البيع</h1>
        {can('sales_orders', 'create') && <button onClick={() => { setEditing(null); setForm({ customer_id: '', date: new Date().toISOString().split('T')[0], items: [{ ...emptyItem }] }); setCashForm({ ...emptyCash }); setCheckForm({ ...emptyCheck }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> طلبية جديدة</button>}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث برقم الطلبية أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="erp-table">
          <thead><tr><th>رقم الطلبية</th><th>التاريخ</th><th>العميل</th><th>عدد الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد طلبيات</td></tr>}
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="font-mono text-sm">{o.order_no}</td>
                <td>{o.date}</td>
                <td className="font-medium">{o.Customer?.name || '-'}</td>
                <td>{o.items?.length || 0}</td>
                <td className="font-bold">{Number(o.total).toLocaleString()} ج.م</td>
                <td>{statusBadge(o.status)}</td>
                <td>
                  <div className="flex gap-1">
                    {o.status === 'pending' && (
                      <button onClick={() => handleConvertToDelivery(o)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1" title="تحويل لإذن تسليم">
                        <MdLocalShipping size={14} /> إذن تسليم
                      </button>
                    )}
                    {can('sales_orders', 'edit') && <button onClick={() => { setEditing(o); setForm({ customer_id: o.customer_id, date: o.date, items: (o.items || []).map(i => ({ item_id: i.item_id, quantity: i.quantity, price: i.price, tax_rate: i.tax_rate || '' })) }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    {can('sales_orders', 'delete') && <button onClick={() => handleDelete(o.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل طلبية بيع' : 'طلبية بيع جديدة'} onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">العميل *</label>
                <select className="erp-input" required value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                  <option value="">— اختر العميل —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <thead><tr><th>الصنف</th><th>الوزن</th><th>السعر</th><th>ضريبة</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="erp-input py-1" value={item.item_id} onChange={e => updateFormItem(idx, 'item_id', e.target.value)}>
                          <option value="">اختر صنف</option>
                          {items.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" className="erp-input py-1 w-24" value={item.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)} /></td>
                      <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={item.price} onChange={e => updateFormItem(idx, 'price', e.target.value)} /></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <input type="checkbox" checked={item.tax_rate !== ''} onChange={e => updateFormItem(idx, 'tax_rate', e.target.checked ? '14' : '')} />
                          {item.tax_rate !== '' && (
                            <div className="flex items-center gap-1">
                              <input type="number" className="erp-input py-1 w-16" value={item.tax_rate} onChange={e => updateFormItem(idx, 'tax_rate', e.target.value)} />
                              <span className="text-xs text-gray-500">%</span>
                            </div>
                          )}
                          {item.tax_rate === '' && <span className="text-xs text-gray-400">بخلاف الضريبة</span>}
                        </div>
                      </td>
                      <td className="font-bold">{calcItemTotal(item).toLocaleString()}</td>
                      <td>{form.items.length > 1 && <button type="button" onClick={() => removeFormItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-left mt-2 text-lg font-bold text-primary">الإجمالي: {calcTotal().toLocaleString()} ج.م</div>
            </div>

            {!editing && (
              <>
                {/* Cash Receipt Section */}
                <div className="border rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setCashForm(p => ({ ...p, enabled: !p.enabled }))} className={`w-full flex items-center justify-between px-4 py-2 text-sm font-semibold transition-colors ${cashForm.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    <span>تحصيل نقدي</span>
                    <span className={`text-lg ${cashForm.enabled ? 'text-green-600' : 'text-gray-400'}`}>{cashForm.enabled ? '✓' : '+'}</span>
                  </button>
                  {cashForm.enabled && (
                    <div className="p-3 grid grid-cols-2 gap-3 bg-white">
                      <div>
                        <label className="form-label">المبلغ *</label>
                        <input type="number" className="erp-input" value={cashForm.amount} onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <label className="form-label">طريقة الدفع</label>
                        <select className="erp-input" value={cashForm.payment_method} onChange={e => setCashForm(p => ({ ...p, payment_method: e.target.value }))}>
                          <option value="نقدي">نقدي</option>
                          <option value="تحويل بنكي">تحويل بنكي</option>
                          <option value="شيك">شيك</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="form-label">ملاحظات</label>
                        <input className="erp-input" value={cashForm.notes} onChange={e => setCashForm(p => ({ ...p, notes: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Check Section */}
                <div className="border rounded-lg overflow-hidden">
                  <button type="button" onClick={() => setCheckForm(p => ({ ...p, enabled: !p.enabled }))} className={`w-full flex items-center justify-between px-4 py-2 text-sm font-semibold transition-colors ${checkForm.enabled ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    <span>شيك قبض</span>
                    <span className={`text-lg ${checkForm.enabled ? 'text-blue-600' : 'text-gray-400'}`}>{checkForm.enabled ? '✓' : '+'}</span>
                  </button>
                  {checkForm.enabled && (
                    <div className="p-3 grid grid-cols-2 gap-3 bg-white">
                      <div>
                        <label className="form-label">رقم الشيك *</label>
                        <input className="erp-input" value={checkForm.check_no} onChange={e => setCheckForm(p => ({ ...p, check_no: e.target.value }))} />
                      </div>
                      <div>
                        <label className="form-label">المبلغ *</label>
                        <input type="number" className="erp-input" value={checkForm.amount} onChange={e => setCheckForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <label className="form-label">تاريخ الاستحقاق</label>
                        <input type="date" className="erp-input" value={checkForm.due_date} onChange={e => setCheckForm(p => ({ ...p, due_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="form-label">البنك</label>
                        <input className="erp-input" value={checkForm.bank_name} onChange={e => setCheckForm(p => ({ ...p, bank_name: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

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

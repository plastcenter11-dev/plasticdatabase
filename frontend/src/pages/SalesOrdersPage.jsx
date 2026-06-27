import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdLocalShipping } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف' },
  { id: 2, name: 'مصنع الأمل للبلاستيك' },
  { id: 3, name: 'توزيعات المحروسة' },
];
const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', price: 45, unit: 'كيلو' },
  { id: 3, code: 'FP-001', name: 'أكياس بلاستيك 30×40', price: 2.5, unit: 'قطعة' },
  { id: 4, code: 'FP-002', name: 'عبوات PET 500ml', price: 1.8, unit: 'قطعة' },
];

const initialOrders = [
  { id: 1, order_no: 'SO-000001', date: '2026-06-15', customer_id: 1, status: 'pending', items: [
    { item_id: 3, name: 'أكياس بلاستيك 30×40', quantity: 2000, price: 2.5, total: 5000 },
    { item_id: 4, name: 'عبوات PET 500ml', quantity: 3000, price: 1.8, total: 5400 },
  ], total: 10400 },
  { id: 2, order_no: 'SO-000002', date: '2026-06-18', customer_id: 2, status: 'delivered', items: [
    { item_id: 1, name: 'بولي إيثيلين عالي الكثافة', quantity: 500, price: 45, total: 22500 },
  ], total: 22500 },
  { id: 3, order_no: 'SO-000003', date: '2026-06-20', customer_id: 3, status: 'pending', items: [
    { item_id: 3, name: 'أكياس بلاستيك 30×40', quantity: 5000, price: 2.5, total: 12500 },
  ], total: 12500 },
];

const emptyItem = { item_id: '', quantity: '', price: '' };

export default function SalesOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ customer_id: '', date: new Date().toISOString().split('T')[0], items: [{ ...emptyItem }] });

  const filtered = orders.filter(o => {
    if (!search) return true;
    const cust = mockCustomers.find(c => c.id === o.customer_id);
    return o.order_no.includes(search) || cust?.name.includes(search);
  });

  const getCustomerName = (id) => mockCustomers.find(c => c.id === id)?.name || '-';
  const statusBadge = (s) => {
    if (s === 'pending') return <span className="badge badge-yellow">قيد الانتظار</span>;
    if (s === 'delivered') return <span className="badge badge-green">تم التسليم</span>;
    return <span className="badge badge-red">ملغاة</span>;
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ customer_id: '', date: new Date().toISOString().split('T')[0], items: [{ ...emptyItem }] });
    setShowModal(true);
  };

  const updateFormItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'item_id') {
      const item = mockItems.find(i => i.id === Number(value));
      if (item) items[idx].price = item.price;
    }
    if (items[idx].quantity && items[idx].price) {
      items[idx].total = Number(items[idx].quantity) * Number(items[idx].price);
    }
    setForm({ ...form, items });
  };

  const addFormItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeFormItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const calcTotal = () => form.items.reduce((sum, i) => sum + (Number(i.quantity || 0) * Number(i.price || 0)), 0);

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');

    const orderItems = form.items.map(i => {
      const item = mockItems.find(m => m.id === Number(i.item_id));
      return { item_id: Number(i.item_id), name: item?.name || '', quantity: Number(i.quantity), price: Number(i.price), total: Number(i.quantity) * Number(i.price) };
    });

    if (editing) {
      setOrders(orders.map(o => o.id === editing.id ? { ...o, customer_id: Number(form.customer_id), date: form.date, items: orderItems, total: calcTotal() } : o));
      toast.success('تم تحديث الطلبية');
    } else {
      const newOrder = {
        id: Date.now(), order_no: `SO-${String(orders.length + 1).padStart(6, '0')}`,
        customer_id: Number(form.customer_id), date: form.date, status: 'pending', items: orderItems, total: calcTotal()
      };
      setOrders([newOrder, ...orders]);
      toast.success('تمت إضافة الطلبية');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذه الطلبية؟')) return;
    setOrders(orders.filter(o => o.id !== id));
    toast.success('تم حذف الطلبية');
  };

  const handleConvertToDelivery = (order) => {
    navigate('/delivery-notes', { state: { openNew: true, customerId: order.customer_id } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">طلبيات البيع</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> طلبية جديدة</button>
      </div>

      <div className="relative max-w-sm">
        <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
        <input className="erp-input pr-10" placeholder="بحث برقم الطلبية أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>رقم الطلبية</th><th>التاريخ</th><th>العميل</th><th>عدد الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد طلبيات</td></tr>}
            {filtered.map(o => (
              <tr key={o.id}>
                <td className="font-mono text-sm">{o.order_no}</td>
                <td>{o.date}</td>
                <td className="font-medium">{getCustomerName(o.customer_id)}</td>
                <td>{o.items.length}</td>
                <td className="font-bold">{o.total.toLocaleString()} ج.م</td>
                <td>{statusBadge(o.status)}</td>
                <td>
                  <div className="flex gap-1">
                    {o.status === 'pending' && (
                      <button onClick={() => handleConvertToDelivery(o)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1" title="تحويل لإذن تسليم">
                        <MdLocalShipping size={14} /> إذن تسليم
                      </button>
                    )}
                    <button onClick={() => { setEditing(o); setForm({ customer_id: o.customer_id, date: o.date, items: o.items.map(i => ({ item_id: i.item_id, quantity: i.quantity, price: i.price })) }); setShowModal(true); }} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(o.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
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
                  {mockCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="erp-input py-1" value={item.item_id} onChange={e => updateFormItem(idx, 'item_id', e.target.value)}>
                          <option value="">اختر صنف</option>
                          {mockItems.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" className="erp-input py-1 w-24" value={item.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)} /></td>
                      <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={item.price} onChange={e => updateFormItem(idx, 'price', e.target.value)} /></td>
                      <td className="font-bold">{((Number(item.quantity) || 0) * (Number(item.price) || 0)).toLocaleString()}</td>
                      <td>{form.items.length > 1 && <button type="button" onClick={() => removeFormItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-left mt-2 text-lg font-bold text-primary">الإجمالي: {calcTotal().toLocaleString()} ج.م</div>
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

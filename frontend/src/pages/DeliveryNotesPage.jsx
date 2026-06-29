import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdSearch, MdReceipt, MdPrint, MdDelete } from 'react-icons/md';
import api from '../api/axios';

const emptyItem = { item_id: '', item_name: '', item_code: '', net_weight: '', batch_no: '', roll_count: '', core_weight: '', wood_weight: '', stretch_weight: '', gross_weight: '' };

function numberToArabicWords(num) {
  if (!num) return '';
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function belowThousand(n) {
    if (n === 0) return '';
    const parts = [];
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    if (h > 0) parts.push(hundreds[h]);
    if (remainder >= 10 && remainder <= 19) {
      parts.push(teens[remainder - 10]);
    } else {
      const t = Math.floor(remainder / 10);
      const o = remainder % 10;
      if (o > 0 && t > 0) parts.push(ones[o] + ' و' + tens[t]);
      else if (o > 0) parts.push(ones[o]);
      else if (t > 0) parts.push(tens[t]);
    }
    return parts.join(' و');
  }

  const kg = Math.floor(num);
  if (kg >= 1000) {
    const t = Math.floor(kg / 1000);
    const r = kg % 1000;
    let tonText = t === 1 ? 'طن' : t === 2 ? 'طنان' : belowThousand(t) + ' طن';
    if (r > 0) tonText += ' و' + belowThousand(r) + ' كيلو';
    return tonText;
  }
  return belowThousand(kg) + ' كيلو';
}

export default function DeliveryNotesPage() {
  const location = useLocation();
  const [notes, setNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);

  const loadData = async () => {
    try {
      const [n, c, it] = await Promise.all([api.get('/delivery-notes'), api.get('/customers'), api.get('/items')]);
      setNotes(n.data); setCustomers(c.data); setAllItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [form, setForm] = useState({ customer_id: '', date: new Date().toISOString().split('T')[0], driver_name: '', car_no: '', selected_orders: [], items: [{ ...emptyItem }] });

  useEffect(() => {
    if (location.state?.openNew) {
      const cid = location.state.customerId || '';
      setForm({ customer_id: String(cid), date: new Date().toISOString().split('T')[0], driver_name: '', car_no: '', selected_orders: [], items: [{ ...emptyItem }] });
      setShowModal(true);
      window.history.replaceState({}, '');
    }
  }, []);

  const filtered = notes.filter(n => {
    const matchSearch = !search || String(n.note_no).includes(search) || n.Customer?.name?.includes(search);
    const matchStatus = !filterStatus || n.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getCustomerName = (id) => customers.find(c => c.id === id)?.name || '-';

  const loadSalesOrders = async (customerId) => {
    if (!customerId) { setSalesOrders([]); return; }
    try { const { data } = await api.get(`/sales-orders/customer/${customerId}/pending`); setSalesOrders(data); }
    catch { setSalesOrders([]); }
  };

  const availableOrders = salesOrders;

  const toggleOrder = (orderId) => {
    const selected = form.selected_orders.includes(orderId)
      ? form.selected_orders.filter(id => id !== orderId)
      : [...form.selected_orders, orderId];

    const orderItems = [];
    selected.forEach(oId => {
      const order = salesOrders.find(o => o.id === oId);
      if (!order) return;
      (order.items || []).forEach(oi => {
        orderItems.push({
          item_id: oi.item_id, item_name: oi.Item?.name || oi.name || '', item_code: oi.Item?.code || oi.code || '',
          ordered_qty: oi.quantity, net_weight: oi.quantity,
          batch_no: '', roll_count: '', core_weight: '', wood_weight: '', stretch_weight: '', gross_weight: '',
          source_order: order.order_no,
        });
      });
    });

    setForm({ ...form, selected_orders: selected, items: orderItems.length > 0 ? orderItems : [{ ...emptyItem }] });
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'item_id') {
      const item = allItems.find(i => i.id === Number(value));
      if (item) { items[idx].item_name = item.name; items[idx].item_code = item.code; }
    }
    if (field === 'gross_weight_manual') {
      items[idx].gross_weight = value;
    } else if (field !== 'gross_weight') {
      const nw = Number(items[idx].net_weight || 0);
      const cw = Number(items[idx].core_weight || 0);
      const ww = Number(items[idx].wood_weight || 0);
      const sw = Number(items[idx].stretch_weight || 0);
      items[idx].gross_weight = Math.round((nw + cw + ww + sw) * 10) / 10;
    }
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id) return toast.error('اختر العميل');
    if (form.items.some(i => !i.item_id || !i.net_weight)) return toast.error('أكمل بيانات الأصناف');

    try {
      await api.post('/delivery-notes', {
        customer_id: Number(form.customer_id), date: form.date,
        driver_name: form.driver_name, car_no: form.car_no,
        linked_orders: form.selected_orders,
        items: form.items.map(i => ({
          item_id: Number(i.item_id), net_weight: Number(i.net_weight),
          batch_no: i.batch_no || '', roll_count: Number(i.roll_count || 0),
          core_weight: Number(i.core_weight || 0), wood_weight: Number(i.wood_weight || 0),
          stretch_weight: Number(i.stretch_weight || 0), gross_weight: Number(i.gross_weight || 0),
          ordered_qty: Number(i.ordered_qty || 0), source_order_no: i.source_order || ''
        }))
      });
      toast.success('تم إنشاء إذن التسليم');
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const openInvoiceModal = (id) => {
    setShowInvoiceModal(id);
    setInvoiceNo('');
  };

  const handleDeliver = async () => {
    if (!invoiceNo.trim()) return toast.error('أدخل رقم الفاتورة');
    try {
      await api.post(`/delivery-notes/${showInvoiceModal}/deliver`, { invoice_no: invoiceNo.trim() });
      toast.success(`تم ترحيل إذن التسليم — فاتورة رقم ${invoiceNo.trim()}`);
      setShowInvoiceModal(null); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف إذن التسليم؟')) return;
    try { await api.delete(`/delivery-notes/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handlePrint = (note, showCompany = true) => {
    const cust = getCustomerName(note.customer_id);
    const printContent = `
      <html dir="rtl"><head><title>إذن استلام بضاعة (${note.note_no})</title>
      <style>
        body{font-family:Cairo,sans-serif;padding:30px 40px;direction:rtl;font-size:14px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
        .header-right{text-align:right}
        .header-left{text-align:left;font-size:13px}
        .company-name{font-size:20px;font-weight:bold;margin-bottom:3px}
        .company-desc{font-size:12px;color:#555;margin-bottom:2px}
        h1{text-align:center;font-size:20px;margin:15px 0 5px}
        .doc-info{display:flex;justify-content:space-between;margin:10px 0}
        .doc-info span{font-size:14px}
        .customer{font-size:16px;margin:10px 0}
        table{width:100%;border-collapse:collapse;margin:15px 0}
        th,td{border:1px solid #333;padding:8px 10px;text-align:right;vertical-align:top}
        th{background:#e8e8e8;font-weight:bold;font-size:13px}
        .qty-col{width:120px;text-align:center;font-size:16px;font-weight:bold}
        .detail-line{margin:2px 0;font-size:13px}
        .detail-label{color:#555}
        .weight-words{font-weight:bold;margin-bottom:5px}
        .footer{margin-top:30px;display:flex;justify-content:space-between;font-size:13px}
        .footer div{min-width:200px}
        .address{text-align:center;margin-top:50px;font-size:12px;color:#666;border-top:1px solid #ccc;padding-top:10px}
      </style></head><body>
      ${showCompany ? `<div class="header">
        <div class="header-right">
          <div class="company-name">شركة بلاست سنتر</div>
          <div class="company-desc">إنتاج وطباعة مواد التعبئة والتغليف</div>
        </div>
        <div class="header-left">
          <div>م . ت : 293219</div>
          <div>بطاقة ضريبية : 5974</div>
          <div>ضريبة القيمة المضافة : 018/461/100</div>
        </div>
      </div>` : ''}
      <h1>اذن استلام بضاعة</h1>
      <div class="doc-info">
        <span><strong>(${note.note_no})</strong></span>
        <span>التاريخ: ${note.date.split('-').reverse().join('/')}</span>
      </div>
      <div class="customer">اسم العميل : <strong>${cust}</strong></div>
      <table>
        <thead><tr><th class="qty-col">الكمية</th><th>البيان</th></tr></thead>
        <tbody>
          ${note.items.map(item => {
            let details = `<div class="weight-words">${numberToArabicWords(item.net_weight)}</div>`;
            details += `<div class="detail-line">${item.item_name} ${item.item_code}</div>`;
            if (item.batch_no) details += `<div class="detail-line"><span class="detail-label">رقم الباتش :</span> ${item.batch_no}</div>`;
            if (item.roll_count) details += `<div class="detail-line"><span class="detail-label">عدد</span> ${item.roll_count} بكرة</div>`;
            if (item.core_weight) details += `<div class="detail-line"><span class="detail-label">وزن الكور</span> ${item.core_weight} كجم</div>`;
            if (item.wood_weight) details += `<div class="detail-line"><span class="detail-label">وزن الخشب</span> ${item.wood_weight} كجم</div>`;
            if (item.stretch_weight) details += `<div class="detail-line"><span class="detail-label">وزن الاسترتش</span> ${item.stretch_weight} كجم</div>`;
            if (item.gross_weight) details += `<div class="detail-line"><strong>الوزن القائم  ${item.gross_weight} كجم</strong></div>`;
            return `<tr><td class="qty-col">${item.net_weight} ك</td><td>${details}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="footer">
        <div>اسم السائق / ${note.driver_name || '_______________'}</div>
        <div>اسم المستلم / ${note.receiver_name || '_______________'}</div>
      </div>
      <div class="footer" style="margin-top:15px">
        <div>رقم السيارة / ${note.car_no || '_______________'}</div>
        <div>التوقيع / _______________</div>
      </div>
      ${showCompany ? '<div class="address">قطعة 171 ب منطقة الصاعات الكيماوية بالمنطقة الصناعية التجمع الثالث - القاهرة</div>' : ''}
      </body></html>`;
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">إذون التسليم</h1>
        <button onClick={() => { setForm({ customer_id: '', date: new Date().toISOString().split('T')[0], driver_name: '', car_no: '', selected_orders: [], items: [{ ...emptyItem }] }); setShowModal(true); }}
          className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> إذن تسليم جديد</button>
      </div>

      <div className="page-card">
        <div className="flex gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث بالرقم أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="erp-input w-auto min-w-[150px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="pending">معلق</option>
            <option value="delivered">تم التسليم</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="erp-table">
            <thead><tr><th>رقم الإذن</th><th>التاريخ</th><th>العميل</th><th>طلبيات البيع</th><th>الأصناف</th><th>إجمالي الوزن</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد إذون تسليم</td></tr>}
              {filtered.map(n => (
                <tr key={n.id}>
                  <td className="font-bold">({n.note_no})</td>
                  <td>{n.date}</td>
                  <td className="font-medium">{n.Customer?.name || getCustomerName(n.customer_id)}</td>
                  <td className="text-xs">{n.SalesOrders?.length > 0 ? n.SalesOrders.map(o => o.order_no).join('، ') : <span className="text-gray-400">—</span>}</td>
                  <td>
                    {(n.items || []).map((item, i) => (
                      <div key={i} className="text-sm">{item.Item?.name || item.item_name || '-'} — {Number(item.net_weight)} كجم ({item.roll_count} بكرة)</div>
                    ))}
                  </td>
                  <td className="font-bold">{(n.items || []).reduce((s, i) => s + Number(i.net_weight), 0).toLocaleString()} كجم</td>
                  <td>{n.status === 'pending' ? <span className="badge badge-yellow">معلق</span> : <span className="badge badge-green">تم التسليم</span>}</td>
                  <td>
                    <div className="flex gap-1">
                      {n.status === 'pending' && (
                        <button onClick={() => openInvoiceModal(n.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1"><MdReceipt size={14} /> ترحيل</button>
                      )}
                      <button onClick={() => handlePrint(n, false)} className="erp-btn erp-btn-outline py-1 px-2 text-xs flex items-center gap-1"><MdPrint size={14} /> طباعة</button>
                      <button onClick={() => handlePrint(n, true)} className="erp-btn erp-btn-outline py-1 px-2 text-xs flex items-center gap-1 text-gray-400"><MdPrint size={14} /> هيدر</button>
                      {n.status === 'pending' && (
                        <button onClick={() => handleDelete(n.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="إذن تسليم جديد" onClose={() => setShowModal(false)} width="max-w-4xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="form-label">العميل *</label>
                <select className="erp-input" required value={form.customer_id} onChange={e => { setForm({ ...form, customer_id: e.target.value, selected_orders: [], items: [{ ...emptyItem }] }); loadSalesOrders(e.target.value); }}>
                  <option value="">— اختر —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">التاريخ *</label>
                <input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="form-label">اسم السائق</label>
                <input className="erp-input" value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} />
              </div>
              <div>
                <label className="form-label">رقم السيارة</label>
                <input className="erp-input" value={form.car_no} onChange={e => setForm({ ...form, car_no: e.target.value })} />
              </div>
            </div>

            {form.customer_id && availableOrders.length > 0 && (
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                <label className="form-label mb-2">طلبيات البيع المتاحة (اختر واحدة أو أكثر)</label>
                <div className="space-y-2">
                  {availableOrders.map(o => (
                    <label key={o.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-blue-100">
                      <input type="checkbox" checked={form.selected_orders.includes(o.id)} onChange={() => toggleOrder(o.id)} className="w-4 h-4" />
                      <span className="font-mono text-sm">{o.order_no}</span>
                      <span className="text-sm text-gray-500">({o.date})</span>
                      <span className="text-sm">— {o.items.length} صنف</span>
                      <span className="text-xs text-gray-400 mr-auto">{o.items.map(i => i.name).join('، ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">الأصناف</label>
                <button type="button" onClick={addItem} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button>
              </div>

              {form.items.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-500">صنف #{idx + 1}</span>
                      {item.source_order && <span className="badge badge-blue text-xs">من {item.source_order}</span>}
                      {item.ordered_qty && <span className="text-xs text-gray-400">(الكمية المطلوبة: {Number(item.ordered_qty).toLocaleString()} كجم)</span>}
                    </div>
                    {form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <div>
                      <label className="form-label">الصنف *</label>
                      {item.source_order ? (
                        <input className="erp-input bg-gray-100" readOnly value={`${item.item_name} (${item.item_code})`} />
                      ) : (
                        <select className="erp-input" value={item.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)}>
                          <option value="">— اختر —</option>
                          {allItems.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="form-label">الوزن الصافي (كجم) *</label>
                      <input type="number" step="0.1" className="erp-input" required value={item.net_weight} onChange={e => updateItem(idx, 'net_weight', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">رقم الباتش</label>
                      <input className="erp-input" value={item.batch_no} onChange={e => updateItem(idx, 'batch_no', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <div>
                      <label className="form-label">عدد البكر</label>
                      <input type="number" className="erp-input" value={item.roll_count} onChange={e => updateItem(idx, 'roll_count', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">وزن الكور</label>
                      <input type="number" step="0.1" className="erp-input" value={item.core_weight} onChange={e => updateItem(idx, 'core_weight', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">وزن الخشب</label>
                      <input type="number" step="0.1" className="erp-input" value={item.wood_weight} onChange={e => updateItem(idx, 'wood_weight', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">وزن الاسترتش</label>
                      <input type="number" step="0.1" className="erp-input" value={item.stretch_weight} onChange={e => updateItem(idx, 'stretch_weight', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">الوزن القائم</label>
                      <input type="number" step="0.1" className="erp-input" value={item.gross_weight} onChange={e => updateItem(idx, 'gross_weight_manual', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ إذن التسليم</button>
            </div>
          </form>
        </Modal>
      )}

      {showInvoiceModal && (
        <Modal title="ترحيل لفاتورة بيع" onClose={() => setShowInvoiceModal(null)} width="max-w-sm">
          <div className="space-y-4">
            <div>
              <label className="form-label">رقم الفاتورة *</label>
              <input className="erp-input" required autoFocus value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="مثال: 1001" />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button onClick={() => setShowInvoiceModal(null)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button onClick={handleDeliver} className="erp-btn erp-btn-primary">ترحيل</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

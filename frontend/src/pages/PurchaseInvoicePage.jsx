import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdEdit, MdSearch, MdCheckCircle, MdDeleteSweep, MdPrint } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyItem = { item_id: '', quantity: '', weight: '', price: '', discount: 0 };
const emptyNewItem = { code: '', name: '', category_id: '', unit: 'كيلو', purchase_price: '', reorder_level: '' };

export default function PurchaseInvoicePage() {
  const { can } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ supplier_id: '', warehouse_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] });
  const [newItemRowIdx, setNewItemRowIdx] = useState(null);
  const [newItemForm, setNewItemForm] = useState(emptyNewItem);

  const loadData = async () => {
    try {
      const [inv, s, it, wh, cats] = await Promise.all([api.get('/purchase-invoices'), api.get('/suppliers'), api.get('/items'), api.get('/warehouses'), api.get('/categories')]);
      setInvoices(inv.data); setSuppliers(s.data); setItems(it.data); setWarehouses(wh.data); setCategories(cats.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const openNewItem = (idx) => {
    const maxId = items.reduce((max, it) => Math.max(max, it.id || 0), 0);
    setNewItemForm({ ...emptyNewItem, code: `ITM-${String(maxId + 1).padStart(4, '0')}` });
    setNewItemRowIdx(idx);
  };

  const saveNewItem = async (e) => {
    e.preventDefault();
    if (!newItemForm.name.trim()) return toast.error('أدخل اسم الصنف');
    try {
      const payload = {
        ...newItemForm,
        purchase_price: Number(newItemForm.purchase_price || 0),
        reorder_level: Number(newItemForm.reorder_level || 0),
        category_id: newItemForm.category_id ? Number(newItemForm.category_id) : null,
      };
      const { data: created } = await api.post('/items', payload);
      setItems(prev => [created, ...prev]);
      updateFormItem(newItemRowIdx, 'item_id', String(created.id));
      toast.success('تمت إضافة الصنف');
      setNewItemRowIdx(null);
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ في إضافة الصنف'); }
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.invoice_no?.includes(search) || inv.Supplier?.name?.includes(search);
    const matchStatus = !filterStatus || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const updateFormItem = (idx, field, value) => {
    const fitems = [...form.items];
    fitems[idx] = { ...fitems[idx], [field]: value };
    if (field === 'item_id') { const item = items.find(i => i.id === Number(value)); if (item) fitems[idx].price = item.purchase_price; }
    setForm({ ...form, items: fitems });
  };
  const addFormItem = () => setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  const removeFormItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const lineDiscount = (i) => (Number(i.weight) || 0) * (Number(i.price) || 0) * (Number(i.discount || 0) / 100);
  const calcGross = () => form.items.reduce((sum, i) => sum + (Number(i.weight) || 0) * (Number(i.price) || 0), 0);
  const calcSubtotal = () => form.items.reduce((sum, i) => sum + ((Number(i.weight) || 0) * (Number(i.price) || 0) - lineDiscount(i)), 0);
  const calcDiscountAmount = () => calcSubtotal() * (Number(form.discount || 0) / 100);
  const calcTax = () => calcGross() * (Number(form.tax_rate) || 0) / 100;
  const calcTotal = () => calcSubtotal() - calcDiscountAmount() + calcTax();

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.supplier_id) return toast.error('اختر المورد');
    if (form.items.some(i => !i.item_id || !i.quantity)) return toast.error('أكمل بيانات الأصناف');
    const subtotal = calcSubtotal(), discAmt = calcDiscountAmount(), taxAmt = Math.round(calcTax()), total = Math.round(calcTotal()), paid = Number(form.paid || 0);
    const payload = {
      supplier_id: Number(form.supplier_id), warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null, date: form.date, subtotal, discount: discAmt, tax_rate: Number(form.tax_rate), tax_amount: taxAmt, total, paid, remaining: total - paid,
      items: form.items.map(i => { const wt = Number(i.weight || 0), pr = Number(i.price || 0), disc = wt * pr * (Number(i.discount || 0) / 100); return { item_id: Number(i.item_id), quantity: Number(i.quantity), weight: wt, price: pr, discount: Number(i.discount || 0), total: wt * pr - disc }; })
    };
    try {
      if (editing) { await api.put(`/purchase-invoices/${editing.id}`, payload); toast.success('تم تحديث الفاتورة'); }
      else { await api.post('/purchase-invoices', payload); toast.success('تمت إضافة الفاتورة'); }
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const openEdit = (inv) => {
    setEditing(inv);
    setForm({
      supplier_id: String(inv.supplier_id), warehouse_id: String(inv.warehouse_id || ''), date: inv.date,
      discount: Number(inv.subtotal) > 0 ? Math.round((Number(inv.discount) / Number(inv.subtotal)) * 10000) / 100 : 0, tax_rate: inv.tax_rate, paid: inv.paid,
      items: (inv.items || []).map(i => ({ item_id: String(i.item_id), quantity: i.quantity, weight: i.weight || '', price: i.price, discount: i.discount || 0 })),
    });
    setShowModal(true);
  };

  const handlePost = async (id) => {
    if (!window.confirm('ترحيل الفاتورة؟')) return;
    try { await api.post(`/purchase-invoices/${id}/post`); toast.success('تم الترحيل'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذه الفاتورة؟')) return;
    try { await api.delete(`/purchase-invoices/${id}`); toast.success('تم الحذف'); setSelectedIds(s => s.filter(x => x !== id)); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(i => i.id));

  const handleBulkDelete = async () => {
    if (!selectedIds.length || !window.confirm(`حذف ${selectedIds.length} فاتورة؟`)) return;
    try { await api.post('/purchase-invoices/bulk-delete', { ids: selectedIds }); toast.success(`تم حذف ${selectedIds.length} فاتورة`); setSelectedIds([]); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handlePrint = (inv) => {
    const sup = inv.Supplier?.name || '-';
    const invItems = inv.items || [];
    const printContent = `<html dir="rtl"><head><title>فاتورة ${inv.invoice_no}</title>
    <style>body{font-family:Cairo,sans-serif;padding:40px;direction:rtl}h1{font-size:22px;text-align:center}
    .info{display:flex;justify-content:space-between;margin:20px 0;font-size:14px}
    table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #333;padding:8px;text-align:right}
    th{background:#f0f0f0}.totals{margin-top:15px;text-align:left;font-size:14px}.totals div{margin:4px 0}.total-line{font-size:18px;font-weight:bold}</style></head><body>
    <h1>فاتورة شراء</h1>
    <div class="info"><span>المورد: <strong>${sup}</strong></span><span>التاريخ: ${inv.date}</span></div>
    <table><thead><tr><th>#</th><th>الصنف</th><th>العدد</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr></thead>
    <tbody>${invItems.map((item, i) => `<tr><td>${i+1}</td><td>${item.Item?.name || '-'}</td><td>${Number(item.quantity).toLocaleString()}</td><td>${item.price}</td><td>${item.discount}</td><td>${Number(item.total).toLocaleString()}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div class="total-line">الإجمالي: ${Number(inv.total).toLocaleString()} ج.م</div></div></body></html>`;
    const win = window.open('', '_blank'); win.document.write(printContent); win.document.close(); win.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">فواتير الشراء</h1>
        <div className="flex gap-2">
          {selectedIds.length > 0 && can('purchase_invoices', 'delete') && <button onClick={handleBulkDelete} className="erp-btn erp-btn-danger flex items-center gap-1"><MdDeleteSweep size={20} /> حذف المحدد ({selectedIds.length})</button>}
          {can('purchase_invoices', 'create') && <button onClick={() => { setEditing(null); setForm({ supplier_id: '', warehouse_id: '', date: new Date().toISOString().split('T')[0], discount: 0, tax_rate: 14, paid: 0, items: [{ ...emptyItem }] }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> فاتورة جديدة</button>}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} /><input className="erp-input pr-10" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="erp-input w-auto min-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="posted">مرحّلة</option></select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th><input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th><th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>}
            {filtered.map(inv => (
              <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'bg-blue-50' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} /></td>
                <td className="font-mono text-sm">{inv.invoice_no}</td>
                <td>{inv.date}</td>
                <td className="font-medium">{inv.Supplier?.name || '-'}</td>
                <td className="font-bold">{Number(inv.total).toLocaleString()} ج.م</td>
                <td className="text-green-600">{Number(inv.paid).toLocaleString()}</td>
                <td className={Number(inv.remaining) > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{Number(inv.remaining).toLocaleString()}</td>
                <td>{inv.status === 'draft' ? <span className="badge badge-yellow">مسودة</span> : <span className="badge badge-green">مرحّلة</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {inv.status === 'draft' && can('purchase_invoices', 'edit') && <button onClick={() => handlePost(inv.id)} className="erp-btn erp-btn-success py-1 px-2 text-xs flex items-center gap-1"><MdCheckCircle size={14} /> ترحيل</button>}
                    {inv.status === 'draft' && can('purchase_invoices', 'edit') && <button onClick={() => openEdit(inv)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    <button onClick={() => handlePrint(inv)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdPrint size={14} /></button>
                    {can('purchase_invoices', 'delete') && <button onClick={() => handleDelete(inv.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
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
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">المورد *</label><SearchableSelect className="erp-input" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}><option value="">— اختر —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</SearchableSelect></div>
              <div><label className="form-label">المخزن</label><SearchableSelect className="erp-input" value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</SearchableSelect></div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="form-label mb-0">الأصناف</label><button type="button" onClick={addFormItem} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ صنف</button></div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>الوزن (كجم)</th><th>العدد</th><th>السعر</th><th>خصم %</th><th>الإجمالي</th><th></th></tr></thead>
                <tbody>{form.items.map((item, idx) => {
                  const lineTotal = (Number(item.weight) || 0) * (Number(item.price) || 0) * (1 - (Number(item.discount || 0) / 100));
                  return (<tr key={idx}>
                    <td>
                      <div className="flex gap-1">
                        <SearchableSelect className="erp-input py-1 flex-1 min-w-0" value={item.item_id} onChange={e => updateFormItem(idx, 'item_id', e.target.value)}><option value="">اختر صنف</option>{items.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}</SearchableSelect>
                        <button type="button" title="إضافة صنف جديد" onClick={() => openNewItem(idx)} className="border border-primary text-primary hover:bg-primary/10 rounded py-1 px-1.5 shrink-0 flex items-center gap-0.5 cursor-pointer text-[10px] leading-none whitespace-nowrap"><MdAdd size={12} /> صنف جديد</button>
                      </div>
                    </td>
                    <td><input type="number" step="0.01" className="erp-input py-1 w-24" placeholder="0.00" value={item.weight} onChange={e => updateFormItem(idx, 'weight', e.target.value)} /></td>
                    <td><input type="number" className="erp-input py-1 w-20" placeholder="0" value={item.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)} /></td>
                    <td><input type="number" step="0.01" className="erp-input py-1 w-20" value={item.price} onChange={e => updateFormItem(idx, 'price', e.target.value)} /></td>
                    <td><input type="number" className="erp-input py-1 w-20" value={item.discount} onChange={e => updateFormItem(idx, 'discount', e.target.value)} /></td>
                    <td className="font-bold">{lineTotal.toLocaleString()}</td>
                    <td>{form.items.length > 1 && <button type="button" onClick={() => removeFormItem(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="form-label">خصم الفاتورة %</label><input type="number" min="0" max="100" step="0.01" className="erp-input" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} /></div>
              <div><label className="form-label">نسبة الضريبة %</label><input type="number" className="erp-input" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></div>
              <div><label className="form-label">المدفوع</label><input type="number" className="erp-input" value={form.paid} onChange={e => setForm({ ...form, paid: e.target.value })} /></div>
              <div className="flex flex-col justify-end gap-1">
                {(Number(form.discount) > 0 || Number(form.tax_rate) > 0) && (
                  <div className="text-xs text-gray-500 mb-1 space-y-0.5">
                    {Number(form.discount) > 0 && <div className="text-red-500">خصم ({form.discount}%): - {calcDiscountAmount().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>}
                    {Number(form.tax_rate) > 0 && <div className="text-green-600">ضريبة ({form.tax_rate}%): + {calcTax().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>}
                  </div>
                )}
                <p className="text-lg font-bold text-primary">{calcTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</p>
              </div>
            </div>
            <div className="flex gap-6 justify-end text-sm border-t pt-3">
              <span>إجمالي الأصناف (قبل خصم الأصناف): <strong>{calcGross().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              {(calcGross() - calcSubtotal()) > 0 && <span className="text-orange-500">خصم الأصناف: <strong>- {(calcGross() - calcSubtotal()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>}
              {Number(form.discount) > 0 && <span className="text-red-500">خصم الفاتورة: <strong>- {calcDiscountAmount().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>}
              {Number(form.tax_rate) > 0 && <span className="text-green-600">الضريبة ({form.tax_rate}%): <strong>+ {calcTax().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ج.م</span>}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      )}

      {newItemRowIdx !== null && (
        <Modal title="صنف جديد" onClose={() => setNewItemRowIdx(null)} width="max-w-md" zIndex={60}>
          <form onSubmit={saveNewItem} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الكود *</label><input className="erp-input" required value={newItemForm.code} onChange={e => setNewItemForm({ ...newItemForm, code: e.target.value })} /></div>
              <div><label className="form-label">القسم</label><SearchableSelect className="erp-input" value={newItemForm.category_id} onChange={e => setNewItemForm({ ...newItemForm, category_id: e.target.value })}><option value="">— بدون قسم —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SearchableSelect></div>
            </div>
            <div><label className="form-label">اسم الصنف *</label><input className="erp-input" required value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="form-label">الوحدة</label><select className="erp-input" value={newItemForm.unit} onChange={e => setNewItemForm({ ...newItemForm, unit: e.target.value })}><option value="كيلو">كيلو</option><option value="قطعة">قطعة</option><option value="-">-</option></select></div>
              <div><label className="form-label">سعر الشراء</label><input type="number" step="0.01" className="erp-input" value={newItemForm.purchase_price} onChange={e => setNewItemForm({ ...newItemForm, purchase_price: e.target.value })} /></div>
              <div><label className="form-label">حد الطلب</label><input type="number" className="erp-input" value={newItemForm.reorder_level} onChange={e => setNewItemForm({ ...newItemForm, reorder_level: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setNewItemRowIdx(null)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ واختيار</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

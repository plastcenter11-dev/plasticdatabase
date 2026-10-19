import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdDelete, MdEdit } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyNewItem = { code: '', name: '', category_id: '', unit: 'كيلو', purchase_price: '', reorder_level: '' };

// Special entry in the component item list: an "extra expenses" line whose
// quantity x price is added to the assembled item's cost (no stock effect).
const EXPENSE_VALUE = '__expense__';
const emptyComp = { item_id: '', warehouse_id: '', quantity: '', weight: '', is_expense: false, price: '' };

export default function ItemAssemblyPage() {
  const { can } = useAuth();
  const [assemblies, setAssemblies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [itemsStock, setItemsStock] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState(emptyNewItem);
  const [assembledFilter, setAssembledFilter] = useState('');
  const emptyForm = { assembled_item_id: '', assembled_qty: '', assembled_weight: '', output_warehouse_id: '', date: new Date().toISOString().split('T')[0], components: [{ ...emptyComp }] };
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [a, w, it, st, cats] = await Promise.all([api.get('/stock/assemblies'), api.get('/warehouses'), api.get('/items'), api.get('/stock/items-stock'), api.get('/categories')]);
      setAssemblies(a.data); setWarehouses(w.data); setItems(it.data); setItemsStock(st.data); setCategories(cats.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const openNewItem = () => {
    const maxId = items.reduce((max, it) => Math.max(max, it.id || 0), 0);
    setNewItemForm({ ...emptyNewItem, code: `ITM-${String(maxId + 1).padStart(4, '0')}` });
    setShowNewItem(true);
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
      setForm(f => ({ ...f, assembled_item_id: String(created.id) }));
      toast.success('تمت إضافة الصنف');
      setShowNewItem(false);
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ في إضافة الصنف'); }
  };

  const getStockByWarehouse = (itemId) => {
    const s = itemsStock.find(r => r.item_id === Number(itemId));
    const map = {};
    (s?.warehouses || []).forEach(w => { map[w.warehouse_id] = w; });
    return map;
  };

  const updateComp = (idx, field, value) => {
    const components = [...form.components];
    components[idx] = { ...components[idx], [field]: value };
    setForm({ ...form, components });
  };
  const pickCompItem = (idx, value) => {
    const components = [...form.components];
    const cur = components[idx];
    components[idx] = value === EXPENSE_VALUE
      ? { ...emptyComp, is_expense: true, quantity: cur.quantity, price: cur.price }
      : { ...cur, item_id: value, is_expense: false, price: '' };
    setForm({ ...form, components });
  };
  const addComp = () => setForm({ ...form, components: [...form.components, { ...emptyComp }] });
  const removeComp = (idx) => setForm({ ...form, components: form.components.filter((_, i) => i !== idx) });

  // Same arithmetic the server uses to price the assembled item, so the figure
  // shown while filling the form is the one that gets saved.
  const componentsCost = form.components.reduce((sum, c) => {
    if (c.is_expense) return sum;
    const item = items.find(i => String(i.id) === String(c.item_id));
    const unit = Number(c.weight || 0) !== 0 ? Number(c.weight) : Number(c.quantity || 0);
    return sum + unit * Number(item?.purchase_price || 0);
  }, 0);
  const expensesCost = form.components.reduce((sum, c) => (c.is_expense ? sum + Number(c.quantity || 0) * Number(c.price || 0) : sum), 0);
  const hasExpense = form.components.some(c => c.is_expense);
  const outputUnit = Number(form.assembled_weight || 0) > 0 ? Number(form.assembled_weight) : Number(form.assembled_qty || 0);
  const outputUnitCost = outputUnit > 0 ? Math.round(((componentsCost + expensesCost) / outputUnit) * 100) / 100 : null;
  const money = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.assembled_item_id || !form.assembled_qty || !form.output_warehouse_id) return toast.error('أكمل البيانات');
    if (form.components.some(c => (c.is_expense ? !(Number(c.quantity) > 0 && Number(c.price) > 0) : (!c.item_id || !c.quantity || !c.warehouse_id)))) return toast.error('أكمل بيانات المكونات (المخزن لكل مكون، والكمية والسعر للمصاريف الإضافية)');
    const payload = {
      assembled_item_id: Number(form.assembled_item_id), assembled_qty: Number(form.assembled_qty),
      assembled_weight: Number(form.assembled_weight || 0),
      output_warehouse_id: Number(form.output_warehouse_id), date: form.date,
      components: form.components.map(c => (c.is_expense
        ? { is_expense: true, quantity: Number(c.quantity), price: Number(c.price) }
        : { item_id: Number(c.item_id), warehouse_id: Number(c.warehouse_id), quantity: Number(c.quantity), weight: Number(c.weight || 0) }))
    };
    try {
      if (editing) { await api.put(`/stock/assemblies/${editing.id}`, payload); toast.success('تم تحديث التركيب'); }
      else { await api.post('/stock/assemblies', payload); toast.success('تم تركيب الصنف'); }
      setShowModal(false); setEditing(null); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      assembled_item_id: String(a.assembled_item_id), assembled_qty: a.assembled_qty, assembled_weight: a.assembled_weight || '',
      output_warehouse_id: String(a.output_warehouse_id || a.warehouse_id || ''), date: a.date,
      components: (a.components || []).map(c => (c.is_expense
        ? { ...emptyComp, is_expense: true, quantity: c.quantity, price: c.price }
        : { ...emptyComp, item_id: String(c.item_id), warehouse_id: String(c.warehouse_id || ''), quantity: c.quantity, weight: c.weight || '' })),
    });
    setShowModal(true);
  };

  const assembledNames = [...new Set(assemblies.map(a => a.assembledItem?.name).filter(Boolean))].sort();
  const filteredAssemblies = assemblies.filter(a => !assembledFilter || a.assembledItem?.name === assembledFilter);

  const handleDelete = async (id) => {
    if (!window.confirm('حذف عملية التركيب؟ سيتم إرجاع المكونات وسحب الصنف المركّب من المخزون.')) return;
    try { await api.delete(`/stock/assemblies/${id}`); toast.success('تم الحذف'); loadData(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تركيب صنف</h1>
        {can('stock', 'create') && <button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> تركيب جديد</button>}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        تركيب الصنف يقوم بصرف المكونات (الخامات) من مخزن الصرف وإضافة المنتج المركّب لمخزن الإضافة.
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr>
            <th>التاريخ</th>
            <th>
              <SearchableSelect className="erp-input py-1 text-sm font-semibold text-gray-700 placeholder:text-gray-700 placeholder:font-semibold min-w-[130px]" value={assembledFilter} onChange={e => setAssembledFilter(e.target.value)}>
                <option value="">الصنف المركّب</option>
                {assembledNames.map(n => <option key={n} value={n}>{n}</option>)}
              </SearchableSelect>
            </th>
            <th>الوزن (كجم)</th><th>العدد</th><th>مخزن الإضافة</th><th>المكونات (الصنف - المخزن - الوزن/العدد)</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filteredAssemblies.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد عمليات تركيب</td></tr>}
            {filteredAssemblies.map(a => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td className="font-bold">{a.assembledItem?.name || '-'}</td>
                <td>{Number(a.assembled_weight || 0).toLocaleString()}</td>
                <td className="font-bold">{Number(a.assembled_qty).toLocaleString()}</td>
                <td className="text-sm">{a.outputWarehouse?.name || a.Warehouse?.name || '-'}</td>
                <td>{(a.components || []).map((c, i) => (c.is_expense
                  ? <div key={i} className="text-sm text-amber-700">مصاريف إضافية: {Number(c.quantity).toLocaleString()} × {Number(c.price).toLocaleString()} = {(Number(c.quantity) * Number(c.price)).toLocaleString()} ج.م</div>
                  : <div key={i} className="text-sm text-gray-600">{c.Item?.name || '-'} — {c.Warehouse?.name || '-'}: {Number(c.weight || 0).toLocaleString()} كجم ({Number(c.quantity).toLocaleString()})</div>))}</td>
                <td>
                  <div className="flex gap-1">
                    {can('stock', 'edit') && <button onClick={() => openEdit(a)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                    {can('stock', 'delete') && <button onClick={() => handleDelete(a.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل تركيب' : 'تركيب صنف جديد'} onClose={() => { setShowModal(false); setEditing(null); }} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">الصنف المركّب *</label>
                <div className="flex gap-1">
                  <SearchableSelect className="erp-input flex-1 min-w-0" required value={form.assembled_item_id} onChange={e => setForm({ ...form, assembled_item_id: e.target.value })}><option value="">— اختر —</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</SearchableSelect>
                  <button type="button" title="إضافة صنف جديد" onClick={openNewItem} className="border border-primary text-primary hover:bg-primary/10 rounded py-1 px-1.5 shrink-0 flex items-center gap-0.5 cursor-pointer text-[10px] leading-none whitespace-nowrap"><MdAdd size={12} /> صنف جديد</button>
                </div>
              </div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الوزن (كجم)</label><input type="number" step="0.01" className="erp-input" value={form.assembled_weight} onChange={e => setForm({ ...form, assembled_weight: e.target.value })} /></div>
              <div><label className="form-label">العدد *</label><input type="number" className="erp-input" required value={form.assembled_qty} onChange={e => setForm({ ...form, assembled_qty: e.target.value })} /></div>
            </div>
            <div><label className="form-label">مخزن الإضافة (الصنف المركّب) *</label><SearchableSelect className="erp-input" required value={form.output_warehouse_id} onChange={e => setForm({ ...form, output_warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</SearchableSelect></div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">المكونات (لكل مكون مخزن صرف مستقل)</label>
                <button type="button" onClick={addComp} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ مكون</button>
              </div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>مخزن الصرف</th><th>الوزن (كجم)</th><th>العدد</th><th></th></tr></thead>
                <tbody>{form.components.map((comp, idx) => {
                  const stockByWh = getStockByWarehouse(comp.item_id);
                  return (
                  <tr key={idx}>
                    <td><SearchableSelect className="erp-input py-1" value={comp.is_expense ? EXPENSE_VALUE : comp.item_id} onChange={e => pickCompItem(idx, e.target.value)}><option value="">اختر صنف</option><option value={EXPENSE_VALUE}>مصاريف إضافية</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</SearchableSelect></td>
                    {comp.is_expense ? (
                      <>
                        <td><input type="number" step="0.01" className="erp-input py-1" placeholder="السعر (ج.م)" value={comp.price} onChange={e => updateComp(idx, 'price', e.target.value)} /></td>
                        <td className="text-sm text-amber-700 whitespace-nowrap">= {money(Number(comp.quantity || 0) * Number(comp.price || 0))} ج.م</td>
                        <td><input type="number" step="0.01" className="erp-input py-1 w-20" placeholder="الكمية" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                      </>
                    ) : (
                      <>
                        <td><SearchableSelect className="erp-input py-1" value={comp.warehouse_id} onChange={e => updateComp(idx, 'warehouse_id', e.target.value)}><option value="">— اختر —</option>{warehouses.map(w => { const s = stockByWh[w.id]; const label = comp.item_id ? (s ? `${w.name} (رصيد: ${s.weight.toLocaleString()} كجم / ${s.quantity.toLocaleString()})` : `${w.name} (لا يوجد رصيد)`) : w.name; return <option key={w.id} value={w.id}>{label}</option>; })}</SearchableSelect></td>
                        <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={comp.weight} onChange={e => updateComp(idx, 'weight', e.target.value)} /></td>
                        <td><input type="number" className="erp-input py-1 w-20" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                      </>
                    )}
                    <td>{form.components.length > 1 && <button type="button" onClick={() => removeComp(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                  </tr>
                  );
                })}</tbody>
              </table>
              {hasExpense && <p className="text-xs text-gray-500 mt-1">المصاريف الإضافية: الكمية × السعر تُضاف لتكلفة الصنف المركّب فقط، ولا تُسحب من المخزن ولا تُضاف لكمية الناتج.</p>}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 grid grid-cols-2 gap-x-4 gap-y-1">
              <span>تكلفة المكونات: <strong>{money(componentsCost)} ج.م</strong></span>
              <span>مصاريف إضافية: <strong>{money(expensesCost)} ج.م</strong></span>
              <span>إجمالي التكلفة: <strong>{money(componentsCost + expensesCost)} ج.م</strong></span>
              <span>تكلفة {Number(form.assembled_weight || 0) > 0 ? 'الكيلو' : 'الوحدة'} من الصنف المركّب: <strong>{outputUnitCost == null ? '—' : `${money(outputUnitCost)} ج.م`}</strong></span>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">{editing ? 'حفظ التعديل' : 'تركيب'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showNewItem && (
        <Modal title="صنف جديد" onClose={() => setShowNewItem(false)} width="max-w-md" zIndex={60}>
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
              <button type="button" onClick={() => setShowNewItem(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">حفظ واختيار</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete, MdEdit } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function ItemAssemblyPage() {
  const { can } = useAuth();
  const [assemblies, setAssemblies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [itemsStock, setItemsStock] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const emptyForm = { assembled_item_id: '', assembled_qty: '', assembled_weight: '', output_warehouse_id: '', date: new Date().toISOString().split('T')[0], components: [{ item_id: '', warehouse_id: '', quantity: '', weight: '' }] };
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [a, w, it, st] = await Promise.all([api.get('/stock/assemblies'), api.get('/warehouses'), api.get('/items'), api.get('/stock/items-stock')]);
      setAssemblies(a.data); setWarehouses(w.data); setItems(it.data); setItemsStock(st.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

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
  const addComp = () => setForm({ ...form, components: [...form.components, { item_id: '', warehouse_id: '', quantity: '', weight: '' }] });
  const removeComp = (idx) => setForm({ ...form, components: form.components.filter((_, i) => i !== idx) });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.assembled_item_id || !form.assembled_qty || !form.output_warehouse_id) return toast.error('أكمل البيانات');
    if (form.components.some(c => !c.item_id || !c.quantity || !c.warehouse_id)) return toast.error('أكمل بيانات المكونات (بما فيها المخزن لكل مكون)');
    const payload = {
      assembled_item_id: Number(form.assembled_item_id), assembled_qty: Number(form.assembled_qty),
      assembled_weight: Number(form.assembled_weight || 0),
      output_warehouse_id: Number(form.output_warehouse_id), date: form.date,
      components: form.components.map(c => ({ item_id: Number(c.item_id), warehouse_id: Number(c.warehouse_id), quantity: Number(c.quantity), weight: Number(c.weight || 0) }))
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
      components: (a.components || []).map(c => ({ item_id: String(c.item_id), warehouse_id: String(c.warehouse_id || ''), quantity: c.quantity, weight: c.weight || '' })),
    });
    setShowModal(true);
  };

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
          <thead><tr><th>التاريخ</th><th>الصنف المركّب</th><th>الوزن (كجم)</th><th>العدد</th><th>مخزن الإضافة</th><th>المكونات (الصنف - المخزن - الوزن/العدد)</th><th>إجراءات</th></tr></thead>
          <tbody>
            {assemblies.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد عمليات تركيب</td></tr>}
            {assemblies.map(a => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td className="font-bold">{a.assembledItem?.name || '-'}</td>
                <td>{Number(a.assembled_weight || 0).toLocaleString()}</td>
                <td className="font-bold">{Number(a.assembled_qty).toLocaleString()}</td>
                <td className="text-sm">{a.outputWarehouse?.name || a.Warehouse?.name || '-'}</td>
                <td>{(a.components || []).map((c, i) => <div key={i} className="text-sm text-gray-600">{c.Item?.name || '-'} — {c.Warehouse?.name || '-'}: {Number(c.weight || 0).toLocaleString()} كجم ({Number(c.quantity).toLocaleString()})</div>)}</td>
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
              <div><label className="form-label">الصنف المركّب *</label><select className="erp-input" required value={form.assembled_item_id} onChange={e => setForm({ ...form, assembled_item_id: e.target.value })}><option value="">— اختر —</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</select></div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الوزن (كجم)</label><input type="number" step="0.01" className="erp-input" value={form.assembled_weight} onChange={e => setForm({ ...form, assembled_weight: e.target.value })} /></div>
              <div><label className="form-label">العدد *</label><input type="number" className="erp-input" required value={form.assembled_qty} onChange={e => setForm({ ...form, assembled_qty: e.target.value })} /></div>
            </div>
            <div><label className="form-label">مخزن الإضافة (الصنف المركّب) *</label><select className="erp-input" required value={form.output_warehouse_id} onChange={e => setForm({ ...form, output_warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
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
                    <td><select className="erp-input py-1" value={comp.item_id} onChange={e => updateComp(idx, 'item_id', e.target.value)}><option value="">اختر صنف</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</select></td>
                    <td><select className="erp-input py-1" value={comp.warehouse_id} onChange={e => updateComp(idx, 'warehouse_id', e.target.value)}><option value="">— اختر —</option>{warehouses.map(w => { const s = stockByWh[w.id]; const label = comp.item_id ? (s ? `${w.name} (رصيد: ${s.weight.toLocaleString()} كجم / ${s.quantity.toLocaleString()})` : `${w.name} (لا يوجد رصيد)`) : w.name; return <option key={w.id} value={w.id}>{label}</option>; })}</select></td>
                    <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={comp.weight} onChange={e => updateComp(idx, 'weight', e.target.value)} /></td>
                    <td><input type="number" className="erp-input py-1 w-20" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                    <td>{form.components.length > 1 && <button type="button" onClick={() => removeComp(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                  </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">{editing ? 'حفظ التعديل' : 'تركيب'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

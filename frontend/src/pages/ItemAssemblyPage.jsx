import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

export default function ItemAssemblyPage() {
  const { can } = useAuth();
  const [assemblies, setAssemblies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const emptyForm = { assembled_item_id: '', assembled_qty: '', assembled_weight: '', warehouse_id: '', output_warehouse_id: '', date: new Date().toISOString().split('T')[0], components: [{ item_id: '', quantity: '', weight: '' }] };
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [a, w, it] = await Promise.all([api.get('/stock/assemblies'), api.get('/warehouses'), api.get('/items')]);
      setAssemblies(a.data); setWarehouses(w.data); setItems(it.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { loadData(); }, []);

  const updateComp = (idx, field, value) => {
    const components = [...form.components];
    components[idx] = { ...components[idx], [field]: value };
    setForm({ ...form, components });
  };
  const addComp = () => setForm({ ...form, components: [...form.components, { item_id: '', quantity: '', weight: '' }] });
  const removeComp = (idx) => setForm({ ...form, components: form.components.filter((_, i) => i !== idx) });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.assembled_item_id || !form.assembled_qty || !form.warehouse_id || !form.output_warehouse_id) return toast.error('أكمل البيانات');
    if (form.components.some(c => !c.item_id || !c.quantity)) return toast.error('أكمل بيانات المكونات');
    try {
      await api.post('/stock/assemblies', {
        assembled_item_id: Number(form.assembled_item_id), assembled_qty: Number(form.assembled_qty),
        assembled_weight: Number(form.assembled_weight || 0), warehouse_id: Number(form.warehouse_id),
        output_warehouse_id: Number(form.output_warehouse_id), date: form.date,
        components: form.components.map(c => ({ item_id: Number(c.item_id), quantity: Number(c.quantity), weight: Number(c.weight || 0) }))
      });
      toast.success('تم تركيب الصنف');
      setShowModal(false); loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تركيب صنف</h1>
        {can('stock', 'create') && <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> تركيب جديد</button>}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        تركيب الصنف يقوم بصرف المكونات (الخامات) من مخزن الصرف وإضافة المنتج المركّب لمخزن الإضافة.
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>التاريخ</th><th>الصنف المركّب</th><th>العدد</th><th>الوزن (كجم)</th><th>مخزن الصرف</th><th>مخزن الإضافة</th><th>المكونات</th></tr></thead>
          <tbody>
            {assemblies.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد عمليات تركيب</td></tr>}
            {assemblies.map(a => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td className="font-bold">{a.assembledItem?.name || '-'}</td>
                <td className="font-bold">{Number(a.assembled_qty).toLocaleString()}</td>
                <td>{Number(a.assembled_weight || 0).toLocaleString()}</td>
                <td className="text-sm">{a.Warehouse?.name || '-'}</td>
                <td className="text-sm">{a.outputWarehouse?.name || a.Warehouse?.name || '-'}</td>
                <td>{(a.components || []).map((c, i) => <div key={i} className="text-sm text-gray-600">{c.Item?.name || '-'}: {Number(c.quantity).toLocaleString()} ({Number(c.weight || 0).toLocaleString()} كجم)</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="تركيب صنف جديد" onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">الصنف المركّب *</label><select className="erp-input" required value={form.assembled_item_id} onChange={e => setForm({ ...form, assembled_item_id: e.target.value })}><option value="">— اختر —</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</select></div>
              <div><label className="form-label">التاريخ *</label><input type="date" className="erp-input" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">العدد *</label><input type="number" className="erp-input" required value={form.assembled_qty} onChange={e => setForm({ ...form, assembled_qty: e.target.value })} /></div>
              <div><label className="form-label">الوزن (كجم)</label><input type="number" step="0.01" className="erp-input" value={form.assembled_weight} onChange={e => setForm({ ...form, assembled_weight: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">مخزن الصرف (المكونات) *</label><select className="erp-input" required value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              <div><label className="form-label">مخزن الإضافة (الصنف المركّب) *</label><select className="erp-input" required value={form.output_warehouse_id} onChange={e => setForm({ ...form, output_warehouse_id: e.target.value })}><option value="">— اختر —</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><label className="form-label mb-0">المكونات</label><button type="button" onClick={addComp} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ مكون</button></div>
              <table className="erp-table">
                <thead><tr><th>الصنف</th><th>العدد</th><th>الوزن (كجم)</th><th></th></tr></thead>
                <tbody>{form.components.map((comp, idx) => (
                  <tr key={idx}>
                    <td><select className="erp-input py-1" value={comp.item_id} onChange={e => updateComp(idx, 'item_id', e.target.value)}><option value="">اختر صنف</option>{items.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}</select></td>
                    <td><input type="number" className="erp-input py-1 w-24" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                    <td><input type="number" step="0.01" className="erp-input py-1 w-24" value={comp.weight} onChange={e => updateComp(idx, 'weight', e.target.value)} /></td>
                    <td>{form.components.length > 1 && <button type="button" onClick={() => removeComp(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowModal(false)} className="erp-btn erp-btn-secondary">إلغاء</button>
              <button type="submit" className="erp-btn erp-btn-primary">تركيب</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

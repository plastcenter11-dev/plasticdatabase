import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdDelete } from 'react-icons/md';

const mockWarehouses = [
  { id: 1, name: 'مخزن الخامات' },
  { id: 2, name: 'مخزن المنتجات التامة' },
];
const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', unit: 'كيلو' },
  { id: 2, code: 'RM-002', name: 'بولي بروبيلين', unit: 'كيلو' },
  { id: 3, code: 'FP-001', name: 'أكياس بلاستيك 30×40', unit: 'قطعة' },
  { id: 4, code: 'FP-002', name: 'عبوات PET 500ml', unit: 'قطعة' },
  { id: 5, code: 'SP-001', name: 'ألوان صناعية', unit: 'كيلو' },
];

const initialAssemblies = [
  { id: 1, date: '2026-06-19', assembled_item: 'أكياس بلاستيك 30×40', assembled_qty: 5000, warehouse_id: 2, components: [
    { name: 'بولي إيثيلين عالي الكثافة', quantity: 50 },
    { name: 'ألوان صناعية', quantity: 2 },
  ]},
];

export default function ItemAssemblyPage() {
  const [assemblies, setAssemblies] = useState(initialAssemblies);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ assembled_item_id: '', assembled_qty: '', warehouse_id: '', date: new Date().toISOString().split('T')[0], components: [{ item_id: '', quantity: '' }] });

  const getWhName = (id) => mockWarehouses.find(w => w.id === id)?.name || '-';

  const updateComp = (idx, field, value) => {
    const components = [...form.components];
    components[idx] = { ...components[idx], [field]: value };
    setForm({ ...form, components });
  };
  const addComp = () => setForm({ ...form, components: [...form.components, { item_id: '', quantity: '' }] });
  const removeComp = (idx) => setForm({ ...form, components: form.components.filter((_, i) => i !== idx) });

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.assembled_item_id || !form.assembled_qty || !form.warehouse_id) return toast.error('أكمل البيانات');
    if (form.components.some(c => !c.item_id || !c.quantity)) return toast.error('أكمل بيانات المكونات');

    const assembledItem = mockItems.find(i => i.id === Number(form.assembled_item_id));
    const comps = form.components.map(c => {
      const item = mockItems.find(i => i.id === Number(c.item_id));
      return { name: item?.name || '', quantity: Number(c.quantity) };
    });

    setAssemblies([{
      id: Date.now(), date: form.date, assembled_item: assembledItem?.name || '',
      assembled_qty: Number(form.assembled_qty), warehouse_id: Number(form.warehouse_id), components: comps
    }, ...assemblies]);
    toast.success('تم تركيب الصنف — تم صرف المكونات وإضافة المنتج');
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('حذف هذا التركيب؟ سيتم عكس التأثير.')) return;
    setAssemblies(assemblies.filter(a => a.id !== id));
    toast.success('تم الحذف');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">تركيب صنف</h1>
        <button onClick={() => { setForm({ assembled_item_id: '', assembled_qty: '', warehouse_id: '', date: new Date().toISOString().split('T')[0], components: [{ item_id: '', quantity: '' }] }); setShowModal(true); }} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> تركيب جديد</button>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        تركيب الصنف يقوم بصرف المكونات (الخامات) من المخزن وإضافة المنتج المركّب.
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>التاريخ</th><th>الصنف المركّب</th><th>الكمية</th><th>المخزن</th><th>المكونات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {assemblies.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد عمليات تركيب</td></tr>}
            {assemblies.map(a => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td className="font-bold">{a.assembled_item}</td>
                <td className="font-bold">{a.assembled_qty.toLocaleString()}</td>
                <td className="text-sm">{getWhName(a.warehouse_id)}</td>
                <td>
                  {a.components.map((c, i) => (
                    <div key={i} className="text-sm text-gray-600">{c.name}: {c.quantity.toLocaleString()}</div>
                  ))}
                </td>
                <td><button onClick={() => handleDelete(a.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="تركيب صنف جديد" onClose={() => setShowModal(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">الصنف المركّب (الناتج) *</label>
                <select className="erp-input" required value={form.assembled_item_id} onChange={e => setForm({ ...form, assembled_item_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {mockItems.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
                </select>
              </div>
              <div><label className="form-label">الكمية الناتجة *</label><input type="number" className="erp-input" required value={form.assembled_qty} onChange={e => setForm({ ...form, assembled_qty: e.target.value })} /></div>
              <div>
                <label className="form-label">المخزن *</label>
                <select className="erp-input" required value={form.warehouse_id} onChange={e => setForm({ ...form, warehouse_id: e.target.value })}>
                  <option value="">— اختر —</option>
                  {mockWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">المكونات (الخامات المصروفة)</label>
                <button type="button" onClick={addComp} className="erp-btn erp-btn-outline py-1 px-2 text-xs">+ مكون</button>
              </div>
              <table className="erp-table">
                <thead><tr><th>الصنف (المكون)</th><th>الكمية</th><th></th></tr></thead>
                <tbody>
                  {form.components.map((comp, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="erp-input py-1" value={comp.item_id} onChange={e => updateComp(idx, 'item_id', e.target.value)}>
                          <option value="">اختر صنف</option>
                          {mockItems.map(i => <option key={i.id} value={i.id}>{i.code} - {i.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" className="erp-input py-1 w-28" value={comp.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} /></td>
                      <td>{form.components.length > 1 && <button type="button" onClick={() => removeComp(idx)} className="text-red-500 text-xs cursor-pointer">حذف</button>}</td>
                    </tr>
                  ))}
                </tbody>
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

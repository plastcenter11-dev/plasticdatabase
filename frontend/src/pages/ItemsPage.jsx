import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';

const emptyForm = { code: '', name: '', category_id: '', type_id: '', unit: 'كيلو', purchase_price: '', reorder_level: '', width: '', is_stockable: true };

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    try {
      const [itemsRes, catsRes, typesRes] = await Promise.all([api.get('/items'), api.get('/categories'), api.get('/item-types')]);
      setItems(itemsRes.data);
      setCategories(catsRes.data);
      setTypes(typesRes.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.includes(search) || i.code.includes(search);
    const matchCat = !filterCat || String(i.category_id) === filterCat;
    return matchSearch && matchCat;
  });

  const generateCode = () => {
    const maxId = items.reduce((max, it) => Math.max(max, it.id || 0), 0);
    return `ITM-${String(maxId + 1).padStart(4, '0')}`;
  };

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, code: generateCode() }); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ code: item.code, name: item.name, category_id: item.category_id || '', type_id: item.type_id || '', unit: item.unit, purchase_price: item.purchase_price, reorder_level: item.reorder_level, width: item.width || '', is_stockable: item.is_stockable });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, purchase_price: Number(form.purchase_price || 0), reorder_level: Number(form.reorder_level || 0), width: form.width !== '' ? Number(form.width) : null, category_id: form.category_id ? Number(form.category_id) : null, type_id: form.type_id ? Number(form.type_id) : null };
      if (editing) {
        await api.put(`/items/${editing.id}`, payload);
        toast.success('تم تحديث الصنف');
      } else {
        await api.post('/items', payload);
        toast.success('تمت إضافة الصنف');
      }
      setShowModal(false);
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الصنف؟')) return;
    try {
      await api.delete(`/items/${id}`);
      toast.success('تم حذف الصنف');
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
  };

  const getCatName = (catId) => categories.find(c => c.id === catId)?.name || '-';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">تعريف أصناف</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1">
          <MdAdd size={20} /> إضافة صنف
        </button>
      </div>

      <div className="page-card">
        <div className="flex gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="erp-input w-auto min-w-[150px]" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">كل الأقسام</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="erp-table">
          <thead>
            <tr><th>الكود</th><th>اسم الصنف</th><th>القسم</th><th>الوحدة</th><th>سعر الشراء</th><th>حد الطلب</th><th>النوع</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد أصناف</td></tr>}
            {filtered.map(item => (
              <tr key={item.id}>
                <td className="font-mono text-xs text-gray-500">{item.code}</td>
                <td className="font-medium">
                  {item.name}
                  {!item.is_stockable && <span className="mr-1 badge badge-gray text-xs">لا مخزني</span>}
                </td>
                <td><span className="badge badge-blue">{getCatName(item.category_id)}</span></td>
                <td>{item.unit}</td>
                <td>{Number(item.purchase_price).toLocaleString()} ج.م</td>
                <td>{Number(item.reorder_level).toLocaleString()}</td>
                <td>{item.ItemType?.name ? <span className="badge badge-blue">{item.ItemType.name}</span> : <span className="text-gray-400 text-xs">—</span>}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-sm text-gray-400 mt-3">إجمالي: {filtered.length} صنف</p>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل صنف' : 'إضافة صنف'} onClose={() => setShowModal(false)} width="max-w-lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">الكود *</label>
                <input className="erp-input" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="form-label">القسم</label>
                <div className="flex gap-1">
                  <select className="erp-input flex-1" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">— بدون قسم —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" title="إضافة قسم جديد" onClick={async () => {
                    const name = window.prompt('اسم القسم الجديد:');
                    if (!name?.trim()) return;
                    try {
                      const r = await api.post('/categories', { name: name.trim() });
                      await loadData();
                      setForm(f => ({ ...f, category_id: String(r.data.id) }));
                    } catch { toast.error('خطأ في إضافة القسم'); }
                  }} className="erp-btn erp-btn-outline px-2 text-lg font-bold">+</button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">النوع</label>
                <div className="flex gap-1">
                  <select className="erp-input flex-1" value={form.type_id} onChange={e => setForm({ ...form, type_id: e.target.value })}>
                    <option value="">— بدون نوع —</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button type="button" title="إضافة نوع جديد" onClick={async () => {
                    const name = window.prompt('اسم النوع الجديد:');
                    if (!name?.trim()) return;
                    try {
                      const r = await api.post('/item-types', { name: name.trim() });
                      await loadData();
                      setForm(f => ({ ...f, type_id: String(r.data.id) }));
                    } catch { toast.error('خطأ في إضافة النوع'); }
                  }} className="erp-btn erp-btn-outline px-2 text-lg font-bold">+</button>
                </div>
              </div>
            </div>
            <div>
              <label className="form-label">اسم الصنف *</label>
              <input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="form-label">الوحدة</label>
                <select className="erp-input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="كيلو">كيلو</option>
                  <option value="قطعة">قطعة</option>
                  <option value="-">-</option>
                </select>
              </div>
              <div>
                <label className="form-label">العرض (سم)</label>
                <input type="number" step="0.01" className="erp-input" placeholder="اختياري" value={form.width} onChange={e => setForm({ ...form, width: e.target.value })} />
              </div>
              <div>
                <label className="form-label">سعر الشراء</label>
                <input type="number" step="0.01" className="erp-input" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} />
              </div>
              <div>
                <label className="form-label">حد الطلب</label>
                <input type="number" className="erp-input" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_stockable" checked={form.is_stockable} onChange={e => setForm({ ...form, is_stockable: e.target.checked })} />
              <label htmlFor="is_stockable" className="text-sm text-gray-700">صنف مخزني (يؤثر على المخزون)</label>
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

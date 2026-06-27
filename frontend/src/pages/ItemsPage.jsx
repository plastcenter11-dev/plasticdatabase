import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';

const mockCategories = [
  { id: 1, name: 'خامات' },
  { id: 2, name: 'منتجات تامة' },
  { id: 3, name: 'مستلزمات تشغيل' },
];

const initialItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', category_id: 1, unit: 'كيلو', price: 45, reorder_level: 500, is_stockable: true, quantity: 1200 },
  { id: 2, code: 'RM-002', name: 'بولي بروبيلين', category_id: 1, unit: 'كيلو', price: 52, reorder_level: 300, is_stockable: true, quantity: 800 },
  { id: 3, code: 'FP-001', name: 'أكياس بلاستيك 30×40', category_id: 2, unit: 'قطعة', price: 2.5, reorder_level: 1000, is_stockable: true, quantity: 5000 },
  { id: 4, code: 'FP-002', name: 'عبوات PET 500ml', category_id: 2, unit: 'قطعة', price: 1.8, reorder_level: 2000, is_stockable: true, quantity: 8000 },
  { id: 5, code: 'SP-001', name: 'ألوان صناعية', category_id: 3, unit: 'كيلو', price: 120, reorder_level: 50, is_stockable: true, quantity: 75 },
  { id: 6, code: 'SV-001', name: 'خدمة نقل', category_id: null, unit: '-', price: 500, reorder_level: 0, is_stockable: false, quantity: 0 },
];

const emptyForm = { code: '', name: '', category_id: '', unit: 'كيلو', price: '', reorder_level: '', is_stockable: true };

export default function ItemsPage() {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.includes(search) || i.code.includes(search);
    const matchCat = !filterCat || String(i.category_id) === filterCat;
    return matchSearch && matchCat;
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ code: item.code, name: item.name, category_id: item.category_id || '', unit: item.unit, price: item.price, reorder_level: item.reorder_level, is_stockable: item.is_stockable });
    setShowModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (editing) {
      setItems(items.map(i => i.id === editing.id ? { ...i, ...form, price: Number(form.price), reorder_level: Number(form.reorder_level), category_id: form.category_id ? Number(form.category_id) : null } : i));
      toast.success('تم تحديث الصنف');
    } else {
      const newItem = { ...form, id: Date.now(), price: Number(form.price), reorder_level: Number(form.reorder_level), category_id: form.category_id ? Number(form.category_id) : null, quantity: 0 };
      setItems([...items, newItem]);
      toast.success('تمت إضافة الصنف');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الصنف؟')) return;
    setItems(items.filter(i => i.id !== id));
    toast.success('تم حذف الصنف');
  };

  const getCatName = (catId) => mockCategories.find(c => c.id === catId)?.name || '-';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">تعريف أصناف</h1>
        <button onClick={openAdd} className="erp-btn erp-btn-primary flex items-center gap-1">
          <MdAdd size={20} /> إضافة صنف
        </button>
      </div>

      <div className="page-card">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث بالاسم أو الكود..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="erp-input w-auto min-w-[150px]" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">كل التصنيفات</option>
            {mockCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>اسم الصنف</th>
              <th>التصنيف</th>
              <th>الوحدة</th>
              <th>سعر الشراء</th>
              <th>حد الطلب</th>
              <th>الرصيد</th>
              <th>النوع</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا توجد أصناف</td></tr>
            )}
            {filtered.map(item => (
              <tr key={item.id}>
                <td className="font-mono text-xs text-gray-500">{item.code}</td>
                <td className="font-medium">{item.name}</td>
                <td><span className="badge badge-blue">{getCatName(item.category_id)}</span></td>
                <td>{item.unit}</td>
                <td>{item.price.toLocaleString()} ج.م</td>
                <td>{item.reorder_level.toLocaleString()}</td>
                <td>
                  <span className={item.quantity <= item.reorder_level && item.is_stockable ? 'text-red-600 font-bold' : ''}>
                    {item.quantity.toLocaleString()}
                  </span>
                </td>
                <td>
                  {item.is_stockable
                    ? <span className="badge badge-green">مخزني</span>
                    : <span className="badge badge-gray">لا مخزني</span>
                  }
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="erp-btn erp-btn-outline py-1 px-2 text-xs">
                      <MdEdit size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs">
                      <MdDelete size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <p className="text-sm text-gray-400 mt-3">إجمالي: {filtered.length} صنف</p>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? 'تعديل صنف' : 'إضافة صنف'} onClose={() => setShowModal(false)} width="max-w-lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">الكود *</label>
                <input className="erp-input" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <label className="form-label">التصنيف</label>
                <select className="erp-input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">بدون تصنيف</option>
                  {mockCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">اسم الصنف *</label>
              <input className="erp-input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">الوحدة</label>
                <select className="erp-input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="كيلو">كيلو</option>
                  <option value="قطعة">قطعة</option>
                  <option value="-">-</option>
                </select>
              </div>
              <div>
                <label className="form-label">سعر الشراء</label>
                <input type="number" step="0.01" className="erp-input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
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

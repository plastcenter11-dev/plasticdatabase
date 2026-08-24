import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { MdAdd, MdEdit, MdDelete, MdSearch } from 'react-icons/md';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';

const emptyForm = { code: '', name: '', unit: 'خدمة', purchase_price: '', sell_price: '', category_id: '', is_stockable: false };

export default function NonStockItemsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const [it, cat] = await Promise.all([api.get('/items'), api.get('/categories')]);
      setItems(it.data.filter(i => !i.is_stockable));
      setCategories(cat.data);
    } catch { toast.error('خطأ في تحميل البيانات'); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => { setEditing(item.id); setForm({ ...item }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('أدخل اسم الصنف');
    try {
      const data = { ...form, is_stockable: false, purchase_price: Number(form.purchase_price || 0), sell_price: Number(form.sell_price || 0) };
      if (editing) await api.put(`/items/${editing}`, data);
      else await api.post('/items', data);
      toast.success(editing ? 'تم التعديل' : 'تم الإضافة');
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ في الحفظ'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الصنف؟')) return;
    try { await api.delete(`/items/${id}`); toast.success('تم الحذف'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'خطأ في الحذف'); }
  };

  const filtered = items.filter(i => !search || i.name?.includes(search) || i.code?.includes(search));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">الأصناف غير المخزنية</h1>
          <p className="text-sm text-gray-500 mt-0.5">خدمات، رسوم، مصروفات — لا يتم تتبعها في المخزون</p>
        </div>
        {can('items', 'create') && <button onClick={openNew} className="erp-btn erp-btn-primary flex items-center gap-1"><MdAdd size={20} /> صنف جديد</button>}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative max-w-sm">
            <MdSearch className="absolute right-3 top-2.5 text-gray-400" size={20} />
            <input className="erp-input pr-10" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="erp-table">
          <thead><tr><th>الكود</th><th>الاسم</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>التصنيف</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد أصناف غير مخزنية</td></tr>}
            {filtered.map(item => (
              <tr key={item.id}>
                <td className="font-mono text-sm text-gray-500">{item.code}</td>
                <td className="font-medium">{item.name}</td>
                <td>{item.unit}</td>
                <td>{Number(item.purchase_price || 0).toLocaleString()} ج.م</td>
                <td>{Number(item.sell_price || 0).toLocaleString()} ج.م</td>
                <td><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{categories.find(c => c.id === item.category_id)?.name || '—'}</span></td>
                <td className="flex gap-1">
                  {can('items', 'edit') && <button onClick={() => openEdit(item)} className="erp-btn erp-btn-outline py-1 px-2 text-xs"><MdEdit size={14} /></button>}
                  {can('items', 'delete') && <button onClick={() => handleDelete(item.id)} className="erp-btn erp-btn-danger py-1 px-2 text-xs"><MdDelete size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'تعديل صنف' : 'صنف غير مخزني جديد'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">الكود</label>
                <input className="erp-input" placeholder="تلقائي إن تُرك فارغاً" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">الاسم *</label>
                <input className="erp-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">الوحدة</label>
                <input className="erp-input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">التصنيف</label>
                <SearchableSelect className="erp-input" value={form.category_id || ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}>
                  <option value="">— بدون تصنيف —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SearchableSelect>
              </div>
              <div>
                <label className="form-label">سعر الشراء</label>
                <input type="number" step="0.01" className="erp-input" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">سعر البيع</label>
                <input type="number" step="0.01" className="erp-input" value={form.sell_price} onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))} />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              هذا الصنف <strong>لا يُدار في المخزون</strong> — يُستخدم في الفواتير كخدمة أو رسم بدون تأثير على الأرصدة المخزنية.
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

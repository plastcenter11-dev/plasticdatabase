import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from './Modal';
import api from '../api/axios';
import { round2 } from '../utils/invoiceCalc';
import { todayStr } from '../utils/today';

// Corrects the date and the line prices of a POSTED invoice. The server does the real work (balances, stock
// movements, receipts...); the figures here are only a preview of what it will save.
//
// kind: 'sales' | 'purchase'    invoiceId: the posted invoice    onDone: called after a successful save
const CFG = {
  sales: { url: '/sales-invoices', party: 'Customer', partyLabel: 'العميل', balanceHint: 'رصيد العميل' },
  purchase: { url: '/purchase-invoices', party: 'Supplier', partyLabel: 'المورد', balanceHint: 'رصيد المورد' },
};

// a line is measured by its weight; a line with no weight, by its count (the same rule as the server)
const lineTotal = (l, price) => {
  const unit = Number(l.weight) > 0 ? Number(l.weight) : Number(l.quantity) || 0;
  return round2(unit * (Number(price) || 0) * (1 - Number(l.discount || 0) / 100));
};

export default function PostedCorrectionModal({ kind, invoiceId, onClose, onDone }) {
  const cfg = CFG[kind];
  const [inv, setInv] = useState(null);
  const [date, setDate] = useState('');
  const [prices, setPrices] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`${cfg.url}/${invoiceId}`).then(r => {
      if (!alive) return;
      setInv(r.data);
      setDate(String(r.data.date).slice(0, 10));
      setPrices(Object.fromEntries((r.data.items || []).map(l => [l.id, String(l.price)])));
    }).catch(err => { toast.error(err.response?.data?.error || 'خطأ في تحميل الفاتورة'); onClose(); });
    return () => { alive = false; };
  }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!inv) return <Modal title="تصحيح فاتورة مرحّلة" onClose={onClose} width="max-w-3xl"><div className="py-8 text-center text-gray-400">جاري التحميل...</div></Modal>;

  const lines = inv.items || [];
  const changedLines = lines.filter(l => Math.abs(Number(prices[l.id]) - Number(l.price)) >= 0.005);
  const dateChanged = date !== String(inv.date).slice(0, 10);
  const priceChanged = changedLines.length > 0;

  // the preview of the new totals (same rules as the server: tax on what is left after the invoice discount)
  const newLines = lines.map(l => ({ ...l, newTotal: lineTotal(l, prices[l.id]) }));
  const subtotal = round2(newLines.reduce((s, l) => s + l.newTotal, 0));
  const discount = Number(inv.discount || 0);
  const tax = round2(Math.max(0, subtotal - discount) * Number(inv.tax_rate || 0) / 100);
  const total = round2(subtotal - discount + tax);
  const paid = Number(inv.paid || 0);
  const remaining = round2(total - paid);
  const diff = round2(total - Number(inv.total || 0));
  const money = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const handleSave = async () => {
    if (!dateChanged && !priceChanged) return toast.info('لا يوجد تغيير');
    if (!date) return toast.error('أدخل التاريخ');
    if (priceChanged && lines.some(l => !(Number(prices[l.id]) >= 0) || prices[l.id] === '')) return toast.error('السعر لازم يكون رقم');
    const what = [dateChanged && `التاريخ ← ${date}`, priceChanged && `أسعار ${changedLines.length} صنف (فرق الإجمالي ${diff > 0 ? '+' : ''}${money(diff)} ج.م)`].filter(Boolean).join(' و ');
    if (!window.confirm(`سيتم تصحيح الفاتورة ${inv.invoice_no}: ${what}.\nرصيد ${cfg.partyLabel} وحركة الصنف والسندات المرتبطة هتتحدث معاها. تأكيد؟`)) return;
    setSaving(true);
    try {
      await api.post(`${cfg.url}/${inv.id}/correct`, {
        date: dateChanged ? date : undefined,
        items: changedLines.map(l => ({ id: l.id, price: Number(prices[l.id]) })),
      });
      toast.success('تم تصحيح الفاتورة');
      onDone?.();
    } catch (err) { toast.error(err.response?.data?.error || 'خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`تصحيح فاتورة مرحّلة — ${inv.invoice_no}`} onClose={onClose} width="max-w-3xl">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
          التصحيح للتاريخ والسعر فقط. الكمية والوزن والمخزن والعميل لا تتغير من هنا — لو غلط فيها اعمل مرتجع وفاتورة جديدة.
          {inv.delivery_note_id && ' الفاتورة جاية من إذن تسليم، فتاريخ الإذن هيتغير معاها.'}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="form-label">{cfg.partyLabel}</div><div className="font-medium">{inv[cfg.party]?.name || '-'}</div></div>
          <div><div className="form-label">التاريخ الحالي</div><div className="font-medium">{String(inv.date).slice(0, 10)}</div></div>
          <div>
            <label className="form-label">التاريخ الصحيح</label>
            <input type="date" className="erp-input" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="erp-table">
            <thead><tr><th>الصنف</th><th>الوزن</th><th>العدد</th><th>السعر الحالي</th><th>السعر الصحيح</th><th>الإجمالي الجديد</th></tr></thead>
            <tbody>
              {newLines.map(l => (
                <tr key={l.id}>
                  <td>{l.Item?.name || '-'}</td>
                  <td>{Number(l.weight) > 0 ? money(l.weight) : '—'}</td>
                  <td>{money(l.quantity)}</td>
                  <td className="text-gray-500">{money(l.price)}</td>
                  <td><input type="number" step="0.01" min="0" className="erp-input w-28" value={prices[l.id] ?? ''} onChange={e => setPrices({ ...prices, [l.id]: e.target.value })} /></td>
                  <td className={Math.abs(l.newTotal - Number(l.total)) >= 0.005 ? 'font-bold text-blue-700' : ''}>{money(l.newTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-lg p-3">
          <div><div className="form-label">الإجمالي قبل الضريبة</div><div className="font-bold">{money(subtotal)}</div></div>
          <div><div className="form-label">الضريبة ({Number(inv.tax_rate || 0)}%)</div><div className="font-bold">{money(tax)}</div></div>
          <div><div className="form-label">إجمالي الفاتورة</div><div className="font-bold">{money(total)} <span className="text-xs text-gray-400">(كان {money(inv.total)})</span></div></div>
          <div><div className="form-label">المتبقي</div><div className="font-bold">{money(remaining)}</div></div>
        </div>
        {priceChanged && <div className="text-sm text-gray-600">{cfg.balanceHint} هيتغير بمقدار <span className="font-bold">{diff > 0 ? '+' : ''}{money(diff)} ج.م</span>.</div>}

        <div className="flex justify-end gap-2 pt-3 border-t">
          <button type="button" onClick={onClose} className="erp-btn erp-btn-secondary">إلغاء</button>
          <button type="button" onClick={handleSave} disabled={saving || (!dateChanged && !priceChanged)} className="erp-btn erp-btn-primary">{saving ? 'جاري الحفظ...' : 'حفظ التصحيح'}</button>
        </div>
      </div>
    </Modal>
  );
}

import { MdPrint } from 'react-icons/md';

const mockSuppliers = [
  { id: 1, name: 'شركة البترول للبتروكيماويات', phone: '02-23456789', total_purchases: 45600, total_paid: 45600, balance: 0 },
  { id: 2, name: 'مصنع الخليج للبلاستيك', phone: '03-4567890', total_purchases: 15960, total_paid: 5000, balance: 10960 },
  { id: 3, name: 'شركة المواد الأولية', phone: '01187654321', total_purchases: 0, total_paid: 0, balance: 0 },
];

export default function SupplierSummaryPage() {
  const totalPurchases = mockSuppliers.reduce((s, su) => s + su.total_purchases, 0);
  const totalPaid = mockSuppliers.reduce((s, su) => s + su.total_paid, 0);
  const totalBalance = mockSuppliers.reduce((s, su) => s + su.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تقرير إجمالي موردين</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المشتريات</p><p className="text-lg font-bold">{totalPurchases.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المدفوعات</p><p className="text-lg font-bold text-success">{totalPaid.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المستحقات</p><p className="text-lg font-bold text-danger">{totalBalance.toLocaleString()} ج.م</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>المورد</th><th>الهاتف</th><th>إجمالي المشتريات</th><th>إجمالي المدفوعات</th><th>المستحق</th></tr></thead>
          <tbody>
            {mockSuppliers.map((s, i) => (
              <tr key={s.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{s.name}</td>
                <td className="font-mono text-sm">{s.phone}</td>
                <td>{s.total_purchases.toLocaleString()} ج.م</td>
                <td className="text-success">{s.total_paid.toLocaleString()} ج.م</td>
                <td className={s.balance > 0 ? 'text-danger font-bold' : 'text-success font-bold'}>{s.balance.toLocaleString()} ج.م</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-gray-100 font-bold">
            <td colSpan={3}>الإجمالي</td>
            <td>{totalPurchases.toLocaleString()} ج.م</td>
            <td className="text-success">{totalPaid.toLocaleString()} ج.م</td>
            <td className="text-danger">{totalBalance.toLocaleString()} ج.م</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

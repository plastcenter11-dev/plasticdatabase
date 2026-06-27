import { MdPrint } from 'react-icons/md';

const mockCustomers = [
  { id: 1, name: 'شركة النيل للتغليف', phone: '01012345678', total_sales: 11856, total_paid: 5000, balance: 6856 },
  { id: 2, name: 'مصنع الأمل للبلاستيك', phone: '01198765432', total_sales: 25080, total_paid: 20000, balance: 5080 },
  { id: 3, name: 'توزيعات المحروسة', phone: '01234567890', total_sales: 12500, total_paid: 0, balance: 17500 },
];

export default function CustomerSummaryPage() {
  const totalSales = mockCustomers.reduce((s, c) => s + c.total_sales, 0);
  const totalPaid = mockCustomers.reduce((s, c) => s + c.total_paid, 0);
  const totalBalance = mockCustomers.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">تقرير إجمالي عملاء</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي المبيعات</p><p className="text-lg font-bold">{totalSales.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي التحصيلات</p><p className="text-lg font-bold text-success">{totalPaid.toLocaleString()} ج.م</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">إجمالي الأرصدة</p><p className="text-lg font-bold text-danger">{totalBalance.toLocaleString()} ج.م</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>#</th><th>العميل</th><th>الهاتف</th><th>إجمالي المبيعات</th><th>إجمالي التحصيلات</th><th>الرصيد</th></tr></thead>
          <tbody>
            {mockCustomers.map((c, i) => (
              <tr key={c.id}>
                <td className="text-gray-400">{i + 1}</td>
                <td className="font-medium">{c.name}</td>
                <td className="font-mono text-sm">{c.phone}</td>
                <td>{c.total_sales.toLocaleString()} ج.م</td>
                <td className="text-success">{c.total_paid.toLocaleString()} ج.م</td>
                <td className={c.balance > 0 ? 'text-danger font-bold' : 'text-success font-bold'}>{c.balance.toLocaleString()} ج.م</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-gray-100 font-bold">
            <td colSpan={3}>الإجمالي</td>
            <td>{totalSales.toLocaleString()} ج.م</td>
            <td className="text-success">{totalPaid.toLocaleString()} ج.م</td>
            <td className="text-danger">{totalBalance.toLocaleString()} ج.م</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

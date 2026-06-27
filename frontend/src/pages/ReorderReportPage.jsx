import { MdWarning, MdPrint } from 'react-icons/md';

const mockItems = [
  { id: 1, code: 'RM-001', name: 'بولي إيثيلين عالي الكثافة', unit: 'كيلو', quantity: 200, reorder_level: 500, warehouse: 'مخزن الخامات' },
  { id: 2, code: 'RM-002', name: 'بولي بروبيلين', unit: 'كيلو', quantity: 150, reorder_level: 300, warehouse: 'مخزن الخامات' },
  { id: 5, code: 'SP-001', name: 'ألوان صناعية', unit: 'كيلو', quantity: 30, reorder_level: 50, warehouse: 'مخزن مستلزمات التشغيل' },
];

export default function ReorderReportPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">أصناف تحت حد الطلب</h1>
        <button onClick={() => window.print()} className="erp-btn erp-btn-outline flex items-center gap-1"><MdPrint size={18} /> طباعة</button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
        <MdWarning size={24} className="text-red-500" />
        <p className="text-sm text-red-700 font-medium">{mockItems.length} صنف تحت حد الطلب ويحتاج إعادة طلب</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>المخزن</th><th>الرصيد الحالي</th><th>حد الطلب</th><th>العجز</th></tr></thead>
          <tbody>
            {mockItems.map(item => (
              <tr key={item.id} className="bg-red-50/50">
                <td className="font-mono text-sm">{item.code}</td>
                <td className="font-medium">{item.name}</td>
                <td>{item.unit}</td>
                <td className="text-sm">{item.warehouse}</td>
                <td className="text-danger font-bold">{item.quantity.toLocaleString()}</td>
                <td>{item.reorder_level.toLocaleString()}</td>
                <td className="text-danger font-bold">{(item.reorder_level - item.quantity).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

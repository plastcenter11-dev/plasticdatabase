import { MdWarehouse, MdAccountBalance } from 'react-icons/md';

const mockStats = {
  itemsBelowReorder: 5,
  overdueChecks: 3,
};

function AlertCard({ icon: Icon, label, count, color }) {
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${color}`}>
      <Icon size={18} />
      <span className="text-xs font-medium">{label}: {count}</span>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      <div className="page-card !p-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">تنبيهات</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AlertCard icon={MdWarehouse} label="أصناف تحت حد الطلب" count={mockStats.itemsBelowReorder}
            color="bg-warning-light text-warning border-warning/30" />
          <AlertCard icon={MdAccountBalance} label="شيكات قبض متأخرة" count={mockStats.overdueChecks}
            color="bg-danger-light text-danger border-danger/30" />
        </div>
      </div>
    </div>
  );
}

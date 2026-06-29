import { useState, useEffect } from 'react';
import { MdWarehouse, MdAccountBalance } from 'react-icons/md';
import api from '../api/axios';

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
  const [stats, setStats] = useState({ reorderCount: 0, overdueChecks: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/items').then(r => r.data.filter(i => i.is_stockable && Number(i.reorder_level) > 0).length),
      api.get('/finance/checks/overdue').then(r => r.data.length),
    ]).then(([reorder, overdue]) => setStats({ reorderCount: reorder, overdueChecks: overdue }))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      <div className="page-card !p-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">تنبيهات</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AlertCard icon={MdWarehouse} label="أصناف تحت حد الطلب" count={stats.reorderCount}
            color="bg-warning-light text-warning border-warning/30" />
          <AlertCard icon={MdAccountBalance} label="شيكات قبض متأخرة" count={stats.overdueChecks}
            color="bg-danger-light text-danger border-danger/30" />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MdWarehouse, MdAccountBalance } from 'react-icons/md';
import api from '../api/axios';

function AlertCard({ icon: Icon, label, count, color, to }) {
  if (count === 0) return null;
  return (
    <Link to={to} className={`flex items-center gap-2 px-3 py-2 rounded-lg border hover:opacity-80 transition ${color}`}>
      <Icon size={18} />
      <span className="text-xs font-medium">{label}: {count}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ reorderCount: 0, overdueChecks: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/items/reports/reorder').then(r => r.data.length).catch(() => 0),
      api.get('/finance/checks/overdue').then(r => r.data.length).catch(() => 0),
    ]).then(([reorder, overdue]) => { setStats({ reorderCount: reorder, overdueChecks: overdue }); setLoaded(true); });
  }, []);

  const none = loaded && stats.reorderCount === 0 && stats.overdueChecks === 0;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      <div className="page-card !p-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">تنبيهات</h2>
        {none && <p className="text-sm text-gray-500">لا توجد تنبيهات حاليًا.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AlertCard icon={MdWarehouse} label="أصناف تحت حد الطلب" count={stats.reorderCount} to="/reports/reorder"
            color="bg-warning-light text-warning border-warning/30" />
          <AlertCard icon={MdAccountBalance} label="شيكات قبض متأخرة" count={stats.overdueChecks} to="/reports/overdue-checks"
            color="bg-danger-light text-danger border-danger/30" />
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MdWarehouse, MdAccountBalance, MdRemoveCircleOutline, MdPeople } from 'react-icons/md';
import api from '../api/axios';

const SHOWN_NAMES = 3;

// one alert: nothing is drawn when there is nothing to warn about
function AlertCard({ icon: Icon, label, count, names = [], color, to }) {
  if (count === 0) return null;
  const extra = count - Math.min(names.length, SHOWN_NAMES);
  return (
    <Link to={to} className={`flex items-start gap-2 px-3 py-2 rounded-lg border hover:opacity-80 transition ${color}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="text-xs">
        <div className="font-medium">{label}: {count}</div>
        {names.length > 0 && (
          <div className="opacity-80 mt-0.5">{names.slice(0, SHOWN_NAMES).join('، ')}{extra > 0 ? ` و${extra} آخرين` : ''}</div>
        )}
      </div>
    </Link>
  );
}

// stock items with a negative weight or count in at least one warehouse
const negativeStockItems = (rows) => rows
  .filter(r => (r.warehouses || []).some(w => Number(w.weight) < 0 || Number(w.quantity) < 0))
  .map(r => r.item_name);

// active customers who owe more than their credit limit (a limit of 0 means "no limit set")
const overLimitCustomers = (customers) => customers
  .filter(c => c.is_active !== false && Number(c.credit_limit) > 0 && Number(c.balance) > Number(c.credit_limit))
  .map(c => c.name);

const EMPTY = { reorderCount: 0, overdueChecks: 0, negative: [], overLimit: [] };

export default function DashboardPage() {
  const [stats, setStats] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  // a request the user has no permission for (or that fails) just means "no alert of that kind"
  useEffect(() => {
    Promise.all([
      api.get('/items/reports/reorder').then(r => r.data.length).catch(() => 0),
      api.get('/finance/checks/overdue').then(r => r.data.length).catch(() => 0),
      api.get('/stock/items-stock').then(r => negativeStockItems(r.data)).catch(() => []),
      api.get('/customers').then(r => overLimitCustomers(r.data)).catch(() => []),
    ]).then(([reorderCount, overdueChecks, negative, overLimit]) => {
      setStats({ reorderCount, overdueChecks, negative, overLimit });
      setLoaded(true);
    });
  }, []);

  const none = loaded && !stats.reorderCount && !stats.overdueChecks && !stats.negative.length && !stats.overLimit.length;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      <div className="page-card !p-3">
        <h2 className="text-sm font-bold text-gray-700 mb-2">تنبيهات</h2>
        {none && <p className="text-sm text-gray-500">لا توجد تنبيهات حاليًا.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AlertCard icon={MdRemoveCircleOutline} label="أصناف رصيدها بالسالب" count={stats.negative.length} names={stats.negative} to="/warehouse-items"
            color="bg-danger-light text-danger border-danger/30" />
          <AlertCard icon={MdPeople} label="عملاء تجاوزوا حد الائتمان" count={stats.overLimit.length} names={stats.overLimit} to="/customer-credit-limits"
            color="bg-danger-light text-danger border-danger/30" />
          <AlertCard icon={MdWarehouse} label="أصناف تحت حد الطلب" count={stats.reorderCount} to="/reports/reorder"
            color="bg-warning-light text-warning border-warning/30" />
          <AlertCard icon={MdAccountBalance} label="شيكات قبض متأخرة" count={stats.overdueChecks} to="/reports/overdue-checks"
            color="bg-danger-light text-danger border-danger/30" />
        </div>
      </div>
    </div>
  );
}

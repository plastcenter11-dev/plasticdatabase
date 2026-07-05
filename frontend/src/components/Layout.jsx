import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  MdDashboard, MdInventory, MdWarehouse, MdPeople, MdLocalShipping,
  MdReceipt, MdShoppingCart, MdAssignment, MdPayment, MdAccountBalance,
  MdAttachMoney, MdTrendingDown, MdBarChart, MdSettings, MdLogout,
  MdCalendarMonth, MdPersonSearch, MdBuild, MdExpandMore,
} from 'react-icons/md';

const menuGroups = [
  { path: '/', label: 'الرئيسية', icon: MdDashboard },
  {
    label: 'المخازن', icon: MdWarehouse,
    items: [
      { path: '/items', label: 'تعريف أصناف', icon: MdInventory },
      { path: '/items-non-stock', label: 'تعريف صنف لا مخزني', icon: MdInventory },
      { path: '/opening-inventory', label: 'جرد أول المدة', icon: MdAssignment },
      { path: '/stock-adjustments', label: 'جرد', icon: MdBuild },
      { path: '/stock-issue', label: 'صرف من المخزن', icon: MdLocalShipping },
      { path: '/stock-receive', label: 'إضافة للمخزن', icon: MdLocalShipping },
      { path: '/warehouse-transfers', label: 'تحويلات مخازن', icon: MdLocalShipping },
      { path: '/item-assembly', label: 'تركيب صنف', icon: MdBuild },
      { path: '/reorder-level', label: 'أمر حد الطلب', icon: MdAssignment },
      { path: '/warehouse-items', label: 'مخزن لأصناف', icon: MdWarehouse },
      { path: '/reports/item-movement', label: 'حركة صنف', icon: MdBarChart },
      { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart },
      { path: '/item-inquiry', label: 'استعلام عن صنف', icon: MdInventory },
    ]
  },
  {
    label: 'المبيعات', icon: MdReceipt,
    items: [
      { path: '/sales-orders', label: 'طلبيات البيع', icon: MdAssignment },
      { path: '/delivery-notes', label: 'إذون التسليم', icon: MdLocalShipping },
      { path: '/sales-invoices', label: 'فواتير بيع', icon: MdReceipt },
      { path: '/sales-returns', label: 'مرتجع مبيعات', icon: MdTrendingDown },
    ]
  },
  {
    label: 'المشتريات', icon: MdShoppingCart,
    items: [
      { path: '/purchase-invoices', label: 'فاتورة شراء', icon: MdShoppingCart },
      { path: '/purchase-returns', label: 'مرتجع مشتريات', icon: MdTrendingDown },
    ]
  },
  {
    label: 'الحسابات', icon: MdPeople,
    items: [
      { path: '/customers', label: 'تعريف عملاء', icon: MdPeople },
      { path: '/suppliers', label: 'تعريف موردين', icon: MdPeople },
      { path: '/opening-balances', label: 'الأرصدة الافتتاحية', icon: MdAccountBalance },
      { path: '/reports/customer-statement', label: 'كشف حساب', icon: MdBarChart },
      { path: '/reports/supplier-statement', label: 'كشف حساب م', icon: MdBarChart },
      { path: '/reports/customers', label: 'تقرير إجمالي عملاء', icon: MdBarChart },
      { path: '/reports/suppliers', label: 'تقرير إجمالي موردين', icon: MdBarChart },
      { path: '/customer-credit-limits', label: 'حدود الائتمان العملاء', icon: MdPeople },
    ]
  },
  {
    label: 'أوراق مالية', icon: MdAccountBalance,
    items: [
      { path: '/cash-receipts', label: 'حركات تحصيل نقدية', icon: MdPayment },
      { path: '/cash-payments', label: 'حركات دفع نقدية', icon: MdPayment },
      { path: '/checks', label: 'شيكات - قبض', icon: MdAccountBalance },
      { path: '/reports/overdue-checks', label: 'شيكات قبض متأخرة', icon: MdAccountBalance },
    ]
  },
  {
    label: 'قيود و مصروفات', icon: MdAttachMoney,
    items: [
      { path: '/expenses', label: 'مصروفات', icon: MdAttachMoney },
      { path: '/other-income', label: 'إيرادات أخرى', icon: MdAttachMoney },
      { path: '/reports/expenses', label: 'تقرير مصروفات', icon: MdBarChart },
    ]
  },
  {
    label: 'موظفين', icon: MdPersonSearch,
    items: [
      { path: '/employees', label: 'تعريف موظفين', icon: MdPersonSearch },
      { path: '/employee-commissions', label: 'عمولة مندوب - صنف', icon: MdAttachMoney },
    ]
  },
  {
    label: 'تعريفات أساسية', icon: MdBuild,
    items: [
      { path: '/warehouses', label: 'تعريف مخزن', icon: MdWarehouse },
      { path: '/document-cycle', label: 'إعدادات الدورة المستندية', icon: MdAssignment },
    ]
  },
  {
    label: 'التقارير', icon: MdBarChart,
    items: [
      { path: '/reports/customer-statement', label: 'كشف حساب عميل', icon: MdBarChart },
      { path: '/reports/supplier-statement', label: 'كشف حساب مورد', icon: MdBarChart },
      { path: '/reports/customers', label: 'تقرير إجمالي عملاء', icon: MdBarChart },
      { path: '/reports/suppliers', label: 'تقرير إجمالي موردين', icon: MdBarChart },
      { path: '/reports/item-movement', label: 'حركة صنف', icon: MdBarChart },
      { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart },
      { path: '/reports/expenses', label: 'تقرير مصروفات', icon: MdBarChart },
      { path: '/reports/overdue-checks', label: 'شيكات قبض متأخرة', icon: MdBarChart },
    ]
  },
  {
    label: 'الإعدادات', icon: MdSettings,
    items: [
      { path: '/settings/options', label: 'خيارات', icon: MdSettings },
      { path: '/users', label: 'حقوق المستخدمين', icon: MdPeople },
      { path: '/settings/record-protection', label: 'حماية السجلات', icon: MdSettings },
      { path: '/settings/change-password', label: 'تغيير كلمة المرور', icon: MdSettings },
      { path: '/settings/unlock-records', label: 'إلغاء حماية السجلات', icon: MdSettings },
      { path: '/settings/backup', label: 'النسخة الاحتياطية', icon: MdSettings },
      { path: '/settings/reset-balances', label: 'إعادة ضبط الأرصدة', icon: MdSettings },
      { path: '/settings/item-setup', label: 'ضبط بيان الأصناف', icon: MdSettings },
      { path: '/settings/company', label: 'بيانات المنشأة', icon: MdSettings },
      { path: '/financial-years', label: 'السنوات المالية', icon: MdCalendarMonth },
    ]
  },
];

function Dropdown({ group, openMenu, setOpenMenu }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const isOpen = openMenu === group.label;
  const location = window.location.pathname;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isOpen, setOpenMenu]);

  const handleItemClick = (path) => {
    navigate(path);
    setOpenMenu(null);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpenMenu(isOpen ? null : group.label)}
        className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition cursor-pointer ${
          isOpen ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <group.icon size={18} />
        <span>{group.label}</span>
        <MdExpandMore size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-48 z-50">
          {group.items.map((item) => (
            <button
              key={item.path}
              onClick={() => handleItemClick(item.path)}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors w-full text-right cursor-pointer ${
                location === item.path ? 'bg-primary-light text-primary font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [openMenu, setOpenMenu] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top navbar */}
      <header className="bg-white shadow-sm no-print z-40 border-b border-gray-200">
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <h1 className="text-sm font-bold text-gray-800">PlasticDB</h1>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">{user?.username || 'مستخدم'}</span>
          <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 cursor-pointer transition" title="تسجيل الخروج">
            <MdLogout size={20} />
          </button>
        </div>

        {/* Menu tabs */}
        <nav className="flex items-center gap-1 px-5 py-1.5 overflow-visible flex-wrap">
          {menuGroups.map((group) =>
            group.path ? (
              <NavLink
                key={group.label}
                to={group.path}
                end
                className={({ isActive }) =>
                  `flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition ${
                    isActive ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <group.icon size={18} />
                <span>{group.label}</span>
              </NavLink>
            ) : (
              <Dropdown key={group.label} group={group} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            )
          )}
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Shortcuts sidebar */}
        <aside className="w-48 bg-[#e2e7ed] border-l border-gray-300 no-print flex flex-col py-4 gap-0.5 overflow-y-auto order-first">
          <p className="px-4 text-xs text-gray-400 font-medium mb-2 pb-2 border-b border-gray-100">اختصارات</p>
          {[
            { path: '/stock-issue', label: 'صرف من المخزن', icon: MdLocalShipping },
            { path: '/stock-receive', label: 'إضافة للمخزن', icon: MdLocalShipping },
            { path: '/warehouse-items', label: 'مخزن الأصناف', icon: MdWarehouse },
            { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart },
            { path: '/delivery-notes', label: 'إذن تسليم', icon: MdAssignment },
          ].map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm transition-colors rounded-lg mx-2 ${
                  isActive ? 'bg-primary-light text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <item.icon size={18} />
              <span className="leading-tight">{item.label}</span>
            </NavLink>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

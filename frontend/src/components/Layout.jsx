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
      { path: '/items', label: 'تعريف أصناف', icon: MdInventory, module: 'items' },
      { path: '/items-non-stock', label: 'تعريف صنف لا مخزني', icon: MdInventory, module: 'items' },
      { path: '/opening-inventory', label: 'جرد أول المدة', icon: MdAssignment, module: 'stock' },
      { path: '/stock-adjustments', label: 'جرد', icon: MdBuild, module: 'stock' },
      { path: '/stock-issue', label: 'صرف من المخزن', icon: MdLocalShipping, module: 'stock' },
      { path: '/stock-receive', label: 'إضافة للمخزن', icon: MdLocalShipping, module: 'stock' },
      { path: '/warehouse-transfers', label: 'تحويلات مخازن', icon: MdLocalShipping, module: 'stock' },
      { path: '/item-assembly', label: 'تركيب صنف', icon: MdBuild, module: 'stock' },
      { path: '/reorder-level', label: 'أمر حد الطلب', icon: MdAssignment, module: 'stock' },
      { path: '/warehouse-items', label: 'مخزن لأصناف', icon: MdWarehouse, module: 'stock' },
      { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart, module: 'stock' },
      { path: '/item-inquiry', label: 'استعلام عن صنف', icon: MdInventory, module: 'stock' },
    ]
  },
  {
    label: 'المبيعات', icon: MdReceipt,
    items: [
      { path: '/delivery-notes', label: 'إذون التسليم', icon: MdLocalShipping, module: 'delivery_notes' },
      { path: '/sales-invoices', label: 'فواتير بيع', icon: MdReceipt, module: 'sales_invoices' },
      { path: '/sales-returns', label: 'مرتجع مبيعات', icon: MdTrendingDown, module: 'sales_invoices' },
    ]
  },
  {
    label: 'المشتريات', icon: MdShoppingCart,
    items: [
      { path: '/purchase-invoices', label: 'فاتورة شراء', icon: MdShoppingCart, module: 'purchase_invoices' },
      { path: '/purchase-returns', label: 'مرتجع مشتريات', icon: MdTrendingDown, module: 'purchase_invoices' },
    ]
  },
  {
    label: 'الحسابات', icon: MdPeople,
    items: [
      { path: '/customers', label: 'تعريف عملاء', icon: MdPeople, module: 'customers' },
      { path: '/suppliers', label: 'تعريف موردين', icon: MdPeople, module: 'suppliers' },
      { path: '/opening-balances', label: 'الأرصدة الافتتاحية', icon: MdAccountBalance, module: 'financial_years' },
      { path: '/reports/customer-statement', label: 'كشف حساب', icon: MdBarChart, module: 'customers' },
      { path: '/reports/supplier-statement', label: 'كشف حساب م', icon: MdBarChart, module: 'suppliers' },
      { path: '/reports/customers', label: 'تقرير إجمالي عملاء', icon: MdBarChart, module: 'customers' },
      { path: '/reports/suppliers', label: 'تقرير إجمالي موردين', icon: MdBarChart, module: 'suppliers' },
      { path: '/customer-credit-limits', label: 'حدود الائتمان العملاء', icon: MdPeople, module: 'customers' },
    ]
  },
  {
    label: 'أوراق مالية', icon: MdAccountBalance,
    items: [
      { path: '/cash-receipts', label: 'حركات تحصيل نقدية', icon: MdPayment, module: 'cash_receipts' },
      { path: '/cash-payments', label: 'حركات دفع نقدية', icon: MdPayment, module: 'cash_payments' },
      { path: '/checks', label: 'شيكات - قبض', icon: MdAccountBalance, module: 'checks' },
      { path: '/reports/overdue-checks', label: 'شيكات قبض متأخرة', icon: MdAccountBalance, module: 'checks' },
    ]
  },
  {
    label: 'قيود و مصروفات', icon: MdAttachMoney,
    items: [
      { path: '/expenses', label: 'مصروفات', icon: MdAttachMoney, module: 'expenses' },
      { path: '/other-income', label: 'إيرادات أخرى', icon: MdAttachMoney, module: 'other_income' },
      { path: '/reports/expenses', label: 'تقرير مصروفات', icon: MdBarChart, module: 'expenses' },
    ]
  },
  {
    label: 'موظفين', icon: MdPersonSearch,
    items: [
      { path: '/employees', label: 'تعريف موظفين', icon: MdPersonSearch, module: 'employees' },
      { path: '/employee-commissions', label: 'عمولة مندوب - صنف', icon: MdAttachMoney, module: 'employees' },
    ]
  },
  {
    label: 'تعريفات أساسية', icon: MdBuild,
    items: [
      { path: '/warehouses', label: 'تعريف مخزن', icon: MdWarehouse, module: 'warehouses' },
      { path: '/document-cycle', label: 'إعدادات الدورة المستندية', icon: MdAssignment, adminOnly: true },
    ]
  },
  {
    label: 'التقارير', icon: MdBarChart,
    items: [
      { path: '/reports/customer-statement', label: 'كشف حساب عميل', icon: MdBarChart, module: 'customers' },
      { path: '/reports/supplier-statement', label: 'كشف حساب مورد', icon: MdBarChart, module: 'suppliers' },
      { path: '/reports/customers', label: 'تقرير إجمالي عملاء', icon: MdBarChart, module: 'customers' },
      { path: '/reports/suppliers', label: 'تقرير إجمالي موردين', icon: MdBarChart, module: 'suppliers' },
      { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart, module: 'stock' },
      { path: '/reports/expenses', label: 'تقرير مصروفات', icon: MdBarChart, module: 'expenses' },
      { path: '/reports/overdue-checks', label: 'شيكات قبض متأخرة', icon: MdBarChart, module: 'checks' },
    ]
  },
  {
    label: 'الإعدادات', icon: MdSettings,
    items: [
      { path: '/settings/options', label: 'خيارات', icon: MdSettings, adminOnly: true },
      { path: '/users', label: 'حقوق المستخدمين', icon: MdPeople, adminOnly: true },
      { path: '/settings/record-protection', label: 'حماية السجلات', icon: MdSettings, adminOnly: true },
      { path: '/settings/change-password', label: 'تغيير كلمة المرور', icon: MdSettings },
      { path: '/settings/unlock-records', label: 'إلغاء حماية السجلات', icon: MdSettings, adminOnly: true },
      { path: '/settings/backup', label: 'النسخة الاحتياطية', icon: MdSettings, adminOnly: true },
      { path: '/settings/reset-balances', label: 'إعادة ضبط الأرصدة', icon: MdSettings, adminOnly: true },
      { path: '/settings/item-setup', label: 'ضبط بيان الأصناف', icon: MdSettings, adminOnly: true },
      { path: '/settings/company', label: 'بيانات المنشأة', icon: MdSettings, adminOnly: true },
      { path: '/financial-years', label: 'السنوات المالية', icon: MdCalendarMonth, module: 'financial_years' },
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
  const { user, logout, isAdmin, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const itemVisible = (item) => {
    if (item.adminOnly) return isAdmin();
    if (!item.module) return true;
    return can(item.module, 'view');
  };

  const visibleGroups = menuGroups
    .map((group) => group.items ? { ...group, items: group.items.filter(itemVisible) } : group)
    .filter((group) => !group.items || group.items.length > 0);

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
          {visibleGroups
            .map((group) =>
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
            { path: '/stock-issue', label: 'صرف من المخزن', icon: MdLocalShipping, module: 'stock' },
            { path: '/stock-receive', label: 'إضافة للمخزن', icon: MdLocalShipping, module: 'stock' },
            { path: '/warehouse-items', label: 'مخزن الأصناف', icon: MdWarehouse, module: 'stock' },
            { path: '/reports/reorder', label: 'أصناف تحت حد الطلب', icon: MdBarChart, module: 'stock' },
            { path: '/delivery-notes', label: 'إذن تسليم', icon: MdAssignment, module: 'delivery_notes' },
          ].filter(itemVisible).map(item => (
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

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ItemsPage from './pages/ItemsPage';
import WarehousesPage from './pages/WarehousesPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import SalesOrdersPage from './pages/SalesOrdersPage';
import DeliveryNotesPage from './pages/DeliveryNotesPage';
import SalesInvoicePage from './pages/SalesInvoicePage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import PurchaseReturnsPage from './pages/PurchaseReturnsPage';
import CashReceiptsPage from './pages/CashReceiptsPage';
import CashPaymentsPage from './pages/CashPaymentsPage';
import ChecksPage from './pages/ChecksPage';
import ExpensesPage from './pages/ExpensesPage';
import OtherIncomePage from './pages/OtherIncomePage';
import StockAdjustmentsPage from './pages/StockAdjustmentsPage';
import WarehouseTransfersPage from './pages/WarehouseTransfersPage';
import ItemAssemblyPage from './pages/ItemAssemblyPage';
import CustomerStatementPage from './pages/CustomerStatementPage';
import SupplierStatementPage from './pages/SupplierStatementPage';
import CustomerSummaryPage from './pages/CustomerSummaryPage';
import SupplierSummaryPage from './pages/SupplierSummaryPage';
import ItemMovementPage from './pages/ItemMovementPage';
import ReorderReportPage from './pages/ReorderReportPage';
import FinancialYearsPage from './pages/FinancialYearsPage';
import OpeningBalancesPage from './pages/OpeningBalancesPage';
import EmployeesPage from './pages/EmployeesPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';

function Placeholder({ title }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-2xl text-gray-300 mb-2">🚧</p>
        <p className="text-gray-500 font-medium">{title}</p>
        <p className="text-sm text-gray-400">قيد الإنشاء</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />

        {/* المخازن */}
        <Route path="items" element={<ItemsPage />} />
        <Route path="items-non-stock" element={<Placeholder title="تعريف صنف لا مخزني" />} />
        <Route path="opening-inventory" element={<Placeholder title="جرد أول المدة" />} />
        <Route path="stock-adjustments" element={<StockAdjustmentsPage />} />
        <Route path="stock-issue" element={<StockAdjustmentsPage />} />
        <Route path="stock-receive" element={<StockAdjustmentsPage />} />
        <Route path="warehouse-transfers" element={<WarehouseTransfersPage />} />
        <Route path="item-assembly" element={<ItemAssemblyPage />} />
        <Route path="reorder-level" element={<Placeholder title="أمر حد الطلب" />} />
        <Route path="warehouse-items" element={<Placeholder title="مخزن لأصناف" />} />
        <Route path="item-inquiry" element={<Placeholder title="استعلام عن صنف" />} />

        {/* المبيعات */}
        <Route path="sales-orders" element={<SalesOrdersPage />} />
        <Route path="delivery-notes" element={<DeliveryNotesPage />} />
        <Route path="sales-invoices" element={<SalesInvoicePage />} />
        <Route path="sales-returns" element={<Placeholder title="مرتجع مبيعات" />} />

        {/* المشتريات */}
        <Route path="purchase-invoices" element={<PurchaseInvoicePage />} />
        <Route path="purchase-returns" element={<PurchaseReturnsPage />} />

        {/* الحسابات */}
        <Route path="customers" element={<CustomersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="opening-balances" element={<OpeningBalancesPage />} />
        <Route path="customer-credit-limits" element={<Placeholder title="حدود الائتمان العملاء" />} />
        <Route path="reports/customer-statement" element={<CustomerStatementPage />} />
        <Route path="reports/customer-statement-summary" element={<CustomerStatementPage />} />
        <Route path="reports/supplier-statement" element={<SupplierStatementPage />} />
        <Route path="reports/customers" element={<CustomerSummaryPage />} />
        <Route path="reports/suppliers" element={<SupplierSummaryPage />} />

        {/* أوراق مالية */}
        <Route path="cash-receipts" element={<CashReceiptsPage />} />
        <Route path="cash-payments" element={<CashPaymentsPage />} />
        <Route path="checks" element={<ChecksPage />} />
        <Route path="reports/overdue-checks" element={<Placeholder title="شيكات قبض متأخرة" />} />

        {/* قيود و مصروفات */}
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="other-income" element={<OtherIncomePage />} />
        <Route path="reports/expenses" element={<Placeholder title="تقرير مصروفات" />} />

        {/* موظفين */}
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employee-commissions" element={<Placeholder title="عمولة مندوب - صنف" />} />

        {/* تعريفات أساسية */}
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="document-cycle" element={<Placeholder title="إعدادات الدورة المستندية" />} />

        {/* التقارير */}
        <Route path="reports/item-movement" element={<ItemMovementPage />} />
        <Route path="reports/reorder" element={<ReorderReportPage />} />

        {/* الإعدادات */}
        <Route path="settings/options" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings/record-protection" element={<SettingsPage />} />
        <Route path="settings/change-password" element={<SettingsPage />} />
        <Route path="settings/unlock-records" element={<SettingsPage />} />
        <Route path="settings/backup" element={<SettingsPage />} />
        <Route path="settings/reset-balances" element={<SettingsPage />} />
        <Route path="settings/item-setup" element={<SettingsPage />} />
        <Route path="settings/company" element={<SettingsPage />} />
        <Route path="financial-years" element={<FinancialYearsPage />} />
        <Route path="users" element={<Placeholder title="المستخدمين" />} />
        <Route path="settings" element={<Placeholder title="الإعدادات" />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

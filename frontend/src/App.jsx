import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ItemsPage from './pages/ItemsPage';
import WarehousesPage from './pages/WarehousesPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
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
import WarehouseItemsPage from './pages/WarehouseItemsPage';
import SalesReturnsPage from './pages/SalesReturnsPage';
import ItemInquiryPage from './pages/ItemInquiryPage';
import CustomerCreditPage from './pages/CustomerCreditPage';
import OverdueChecksPage from './pages/OverdueChecksPage';
import ExpensesReportPage from './pages/ExpensesReportPage';
import CommissionsPage from './pages/CommissionsPage';
import ReorderOrderPage from './pages/ReorderOrderPage';
import DocumentCyclePage from './pages/DocumentCyclePage';
import NonStockItemsPage from './pages/NonStockItemsPage';
import OpeningInventoryPage from './pages/OpeningInventoryPage';

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

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin() ? children : <Navigate to="/" />;
}

function ModuleRoute({ module, children }) {
  const { can } = useAuth();
  return can(module, 'view') ? children : <Navigate to="/" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />

        {/* المخازن */}
        <Route path="items" element={<ModuleRoute module="items"><ItemsPage /></ModuleRoute>} />
        <Route path="items-non-stock" element={<ModuleRoute module="items"><NonStockItemsPage /></ModuleRoute>} />
        <Route path="opening-inventory" element={<ModuleRoute module="stock"><OpeningInventoryPage /></ModuleRoute>} />
        <Route path="stock-adjustments" element={<ModuleRoute module="stock"><StockAdjustmentsPage /></ModuleRoute>} />
        <Route path="stock-issue" element={<ModuleRoute module="stock"><StockAdjustmentsPage /></ModuleRoute>} />
        <Route path="stock-receive" element={<ModuleRoute module="stock"><StockAdjustmentsPage /></ModuleRoute>} />
        <Route path="warehouse-transfers" element={<ModuleRoute module="stock"><WarehouseTransfersPage /></ModuleRoute>} />
        <Route path="item-assembly" element={<ModuleRoute module="stock"><ItemAssemblyPage /></ModuleRoute>} />
        <Route path="reorder-level" element={<ModuleRoute module="stock"><ReorderOrderPage /></ModuleRoute>} />
        <Route path="warehouse-items" element={<ModuleRoute module="stock"><WarehouseItemsPage /></ModuleRoute>} />
        <Route path="item-inquiry" element={<ModuleRoute module="stock"><ItemInquiryPage /></ModuleRoute>} />

        {/* المبيعات */}
        <Route path="delivery-notes" element={<ModuleRoute module="delivery_notes"><DeliveryNotesPage /></ModuleRoute>} />
        <Route path="sales-invoices" element={<ModuleRoute module="sales_invoices"><SalesInvoicePage /></ModuleRoute>} />
        <Route path="sales-returns" element={<ModuleRoute module="sales_invoices"><SalesReturnsPage /></ModuleRoute>} />

        {/* المشتريات */}
        <Route path="purchase-invoices" element={<ModuleRoute module="purchase_invoices"><PurchaseInvoicePage /></ModuleRoute>} />
        <Route path="purchase-returns" element={<ModuleRoute module="purchase_invoices"><PurchaseReturnsPage /></ModuleRoute>} />

        {/* الحسابات */}
        <Route path="customers" element={<ModuleRoute module="customers"><CustomersPage /></ModuleRoute>} />
        <Route path="suppliers" element={<ModuleRoute module="suppliers"><SuppliersPage /></ModuleRoute>} />
        <Route path="opening-balances" element={<ModuleRoute module="financial_years"><OpeningBalancesPage /></ModuleRoute>} />
        <Route path="customer-credit-limits" element={<ModuleRoute module="customers"><CustomerCreditPage /></ModuleRoute>} />
        <Route path="reports/customer-statement" element={<ModuleRoute module="customers"><CustomerStatementPage /></ModuleRoute>} />
        <Route path="reports/customer-statement-summary" element={<ModuleRoute module="customers"><CustomerStatementPage /></ModuleRoute>} />
        <Route path="reports/supplier-statement" element={<ModuleRoute module="suppliers"><SupplierStatementPage /></ModuleRoute>} />
        <Route path="reports/customers" element={<ModuleRoute module="customers"><CustomerSummaryPage /></ModuleRoute>} />
        <Route path="reports/suppliers" element={<ModuleRoute module="suppliers"><SupplierSummaryPage /></ModuleRoute>} />

        {/* أوراق مالية */}
        <Route path="cash-receipts" element={<ModuleRoute module="cash_receipts"><CashReceiptsPage /></ModuleRoute>} />
        <Route path="cash-payments" element={<ModuleRoute module="cash_payments"><CashPaymentsPage /></ModuleRoute>} />
        <Route path="checks" element={<ModuleRoute module="checks"><ChecksPage /></ModuleRoute>} />
        <Route path="reports/overdue-checks" element={<ModuleRoute module="checks"><OverdueChecksPage /></ModuleRoute>} />

        {/* قيود و مصروفات */}
        <Route path="expenses" element={<ModuleRoute module="expenses"><ExpensesPage /></ModuleRoute>} />
        <Route path="other-income" element={<ModuleRoute module="other_income"><OtherIncomePage /></ModuleRoute>} />
        <Route path="reports/expenses" element={<ModuleRoute module="expenses"><ExpensesReportPage /></ModuleRoute>} />

        {/* موظفين */}
        <Route path="employees" element={<ModuleRoute module="employees"><EmployeesPage /></ModuleRoute>} />
        <Route path="employee-commissions" element={<ModuleRoute module="employees"><CommissionsPage /></ModuleRoute>} />

        {/* تعريفات أساسية */}
        <Route path="warehouses" element={<ModuleRoute module="warehouses"><WarehousesPage /></ModuleRoute>} />
        <Route path="document-cycle" element={<AdminRoute><DocumentCyclePage /></AdminRoute>} />

        {/* التقارير */}
        <Route path="reports/item-movement" element={<ModuleRoute module="stock"><ItemMovementPage /></ModuleRoute>} />
        <Route path="reports/reorder" element={<ModuleRoute module="stock"><ReorderReportPage /></ModuleRoute>} />

        {/* الإعدادات — كل شيء إداري ما عدا تغيير كلمة المرور للأدمن فقط */}
        <Route path="settings/options" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="settings/record-protection" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="settings/change-password" element={<SettingsPage />} />
        <Route path="settings/unlock-records" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="settings/backup" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="settings/reset-balances" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="settings/item-setup" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="settings/company" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="financial-years" element={<ModuleRoute module="financial_years"><FinancialYearsPage /></ModuleRoute>} />
        <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
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

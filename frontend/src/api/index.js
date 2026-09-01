import api from './axios';

const crud = (path) => ({
  list: (params) => api.get(path, { params }),
  get: (id) => api.get(`${path}/${id}`),
  create: (data) => api.post(path, data),
  update: (id, data) => api.put(`${path}/${id}`, data),
  delete: (id) => api.delete(`${path}/${id}`),
});

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const itemsAPI = { ...crud('/items'), search: (q) => api.get('/items', { params: { search: q } }) };
export const categoriesAPI = crud('/categories');
export const warehousesAPI = crud('/warehouses');
export const customersAPI = { ...crud('/customers'), statement: (id, params) => api.get(`/customers/${id}/statement`, { params }) };
export const suppliersAPI = { ...crud('/suppliers'), statement: (id, params) => api.get(`/suppliers/${id}/statement`, { params }) };
export const employeesAPI = crud('/employees');

export const deliveryNotesAPI = { ...crud('/delivery-notes'), convertToInvoice: (id) => api.post(`/delivery-notes/${id}/convert`) };
export const salesInvoicesAPI = {
  ...crud('/sales-invoices'),
  post: (id) => api.put(`/sales-invoices/${id}/post`),
  bulkDelete: (data) => api.delete('/sales-invoices/bulk', { data }),
};
export const purchaseInvoicesAPI = {
  ...crud('/purchase-invoices'),
  post: (id) => api.put(`/purchase-invoices/${id}/post`),
  bulkDelete: (data) => api.delete('/purchase-invoices/bulk', { data }),
};
export const salesReturnsAPI = crud('/sales-returns');
export const purchaseReturnsAPI = crud('/purchase-returns');

export const cashReceiptsAPI = crud('/cash-receipts');
export const cashPaymentsAPI = crud('/cash-payments');
export const checksAPI = { ...crud('/checks'), overdue: () => api.get('/checks/overdue') };

export const expensesAPI = { ...crud('/expenses'), report: (params) => api.get('/expenses/report', { params }) };
export const otherIncomeAPI = crud('/other-income');

export const stockAPI = {
  adjust: (data) => api.post('/stock/adjust', data),
  transfer: (data) => api.post('/stock/transfer', data),
  assemble: (data) => api.post('/stock/assemble', data),
  movement: (params) => api.get('/stock/movement', { params }),
  inventory: (params) => api.get('/stock/inventory', { params }),
  reorder: () => api.get('/stock/reorder'),
  inquiry: (itemId) => api.get(`/stock/inquiry/${itemId}`),
};

export const financialYearsAPI = {
  ...crud('/financial-years'),
  activate: (id) => api.put(`/financial-years/${id}/activate`),
  closeYear: (data) => api.post('/financial-years/close', data),
};

export const openingBalancesAPI = crud('/opening-balances');
export const usersAPI = crud('/users');
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};
export const reportsAPI = {
  customerSummary: (params) => api.get('/reports/customers', { params }),
  supplierSummary: (params) => api.get('/reports/suppliers', { params }),
  expenseReport: (params) => api.get('/reports/expenses', { params }),
  overdueChecks: () => api.get('/reports/overdue-checks'),
  dashboard: () => api.get('/reports/dashboard'),
};

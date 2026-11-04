import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import CustomerStatementPage from './CustomerStatementPage';
import SupplierStatementPage from './SupplierStatementPage';

// One statement screen for both kinds of account: pick customer or supplier first.
export default function AccountStatementPage() {
  const { can } = useAuth();
  const kinds = [
    { key: 'customer', label: 'عميل', allowed: can('customers', 'view'), Page: CustomerStatementPage },
    { key: 'supplier', label: 'مورد', allowed: can('suppliers', 'view'), Page: SupplierStatementPage },
  ].filter(k => k.allowed);
  const [kind, setKind] = useState('customer');
  const current = kinds.find(k => k.key === kind) || kinds[0];
  if (!current) return null;
  return (
    <div className="space-y-4">
      {kinds.length > 1 && (
        <div className="flex gap-2">
          {kinds.map(k => (
            <button key={k.key} onClick={() => setKind(k.key)} className={`erp-btn ${current.key === k.key ? 'erp-btn-primary' : 'erp-btn-outline'}`}>{k.label}</button>
          ))}
        </div>
      )}
      <current.Page key={current.key} />
    </div>
  );
}

import { Link, useLocation } from 'react-router-dom';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="page-card text-center py-12 space-y-3">
      <h1 className="text-2xl font-bold text-gray-800">الصفحة غير موجودة</h1>
      <p className="text-gray-500 text-sm" dir="ltr">{pathname}</p>
      <p className="text-gray-600">الرابط ده مش موجود في البرنامج. اختار شاشة من القوائم فوق أو ارجع للرئيسية.</p>
      <Link to="/" className="erp-btn erp-btn-primary inline-block">الرئيسية</Link>
    </div>
  );
}

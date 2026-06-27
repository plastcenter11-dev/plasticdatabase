import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Mock login — will be replaced with API call
      if (form.username && form.password) {
        login({ id: 1, username: form.username, role: 'admin' }, 'mock-token');
        toast.success('تم تسجيل الدخول');
        navigate('/');
      }
    } catch {
      toast.error('خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-blue-50 to-gray-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">P</div>
          <h1 className="text-xl font-bold text-gray-800">PlasticDB</h1>
          <p className="text-sm text-gray-500">نظام إدارة المصنع</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">اسم المستخدم</label>
            <input className="erp-input" required value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })} placeholder="admin" />
          </div>
          <div>
            <label className="form-label">كلمة المرور</label>
            <input className="erp-input" type="password" required value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="erp-btn erp-btn-primary w-full py-3 text-base disabled:opacity-50">
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}

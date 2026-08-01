const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Sub-actions that mutate an existing record (as opposed to creating a new one)
const EDIT_ACTION_RE = /(?:^|\/)(post|deliver|confirm|activate|close|restore)(?:\/|$)/;
const BULK_DELETE_RE = /bulk-delete/;

async function auth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) return res.status(401).json({ error: 'المستخدم غير نشط' });
    req.user = { id: user.id, username: user.username, role: user.role, permissions: user.permissions || {} };
    next();
  } catch {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'مسموح للمديرين فقط' });
  next();
}

function actionForRequest(req) {
  if (req.method === 'GET') return 'view';
  if (req.method === 'DELETE') return 'delete';
  if (req.method === 'PUT' || req.method === 'PATCH') return 'edit';
  if (req.method === 'POST') {
    if (BULK_DELETE_RE.test(req.path)) return 'delete';
    if (EDIT_ACTION_RE.test(req.path)) return 'edit';
    return 'create';
  }
  return 'view';
}

// Foundational reference data (used for dropdowns/lookups across almost every
// transactional page) stays viewable to any authenticated user regardless of
// their module permissions — otherwise a user with e.g. delivery_notes:view
// but no customers/items/warehouses permission can't even load that page,
// since it needs customer/item/warehouse names to render. Create/edit/delete
// on these modules still requires the explicit permission.
const ALWAYS_VIEWABLE_MODULES = new Set(['items', 'customers', 'suppliers', 'warehouses']);

function hasPermission(user, moduleName, action) {
  if (user?.role === 'admin') return true;
  if (action === 'view' && ALWAYS_VIEWABLE_MODULES.has(moduleName)) return true;
  const perms = user?.permissions?.[moduleName];
  return Array.isArray(perms) && perms.includes(action);
}

// Applies a single fixed permission module to every route in the mounted router.
function requireModule(moduleName) {
  return (req, res, next) => {
    if (hasPermission(req.user, moduleName, actionForRequest(req))) return next();
    res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

// For routers that mix multiple resources (e.g. finance.js, settings.js):
// pathModuleMap is an array of [RegExp, moduleName] tested against req.path.
// Unmatched paths pass through (e.g. admin-only routes that check permissions themselves).
function requireModuleByPath(pathModuleMap) {
  return (req, res, next) => {
    const entry = pathModuleMap.find(([re]) => re.test(req.path));
    if (!entry) return next();
    if (hasPermission(req.user, entry[1], actionForRequest(req))) return next();
    res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
  };
}

module.exports = { auth, adminOnly, requireModule, requireModuleByPath };

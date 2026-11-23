'use strict';

// Who may LOOK at a closed financial year.
//
// Closing a year already stops anyone changing its documents (closedYearError). This also hides it from
// reading: a user who is not an admin and has no 'view_closed' on the financial-years permission sees nothing
// dated inside a closed year, anywhere:
//   - lists of documents (invoices, delivery notes, returns, receipts, payments, checks, expenses, income,
//     stock movements, transfers, assemblies) simply do not contain those rows;
//   - one document of a closed year (an invoice opened by its id) is refused with a 403;
//   - account statements start from the first open day with a "رصيد مرحّل" line, so the balances stay right;
//   - an item's movements start with one "رصيد مرحّل" line per warehouse for the same reason.
// Totals that are not a list of dated rows (customer and supplier balances, stock balances) are untouched.
// The overdue-checks alert is a to-do list, not history, so it is left alone.

const models = require('../models');
const { FinancialYear } = models;

const ymd = (v) => {
  if (!v) return '';
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const canViewClosed = (user) => user?.role === 'admin'
  || (Array.isArray(user?.permissions?.financial_years) && user.permissions.financial_years.includes('view_closed'));

async function closedRanges() {
  const years = await FinancialYear.findAll({ where: { is_closed: true } });
  return years.map(y => ({ start: ymd(y.start_date), end: ymd(y.end_date) })).filter(r => r.start && r.end);
}

const inRanges = (date, ranges) => { const d = ymd(date); return !!d && ranges.some(r => d >= r.start && d <= r.end); };

// the item-movement screen works out a running balance per warehouse from the rows it is given (see
// ItemMovementPage): the hidden rows are folded into one opening row per warehouse with the same arithmetic
const INCOMING = new Set(['إضافة', 'تحويل داخل', 'فاتورة شراء', 'مرتجع بيع']);
const OUTGOING = new Set(['صرف', 'تحويل خارج', 'فاتورة بيع', 'مرتجع شراء']);
function isIncomingMovement(m) {
  if (INCOMING.has(m.movement_type)) return true;
  if (OUTGOING.has(m.movement_type)) return false;
  if (m.movement_type === 'تركيب') return String(m.description || '').includes('ناتج') || Number(m.weight || 0) < 0 || Number(m.quantity || 0) < 0;
  return true;
}
function carryForwardRows(hidden, cutoff) {
  const bal = new Map();
  const sample = new Map();
  for (const m of hidden) {
    const key = m.warehouse_id ?? 0;
    const b = bal.get(key) || { w: 0, q: 0 };
    if (m.movement_type === 'تعديل جرد') bal.set(key, { w: Number(m.weight || 0), q: Number(m.quantity || 0) });
    else {
      const sign = isIncomingMovement(m) ? 1 : -1;
      bal.set(key, { w: b.w + sign * Math.abs(Number(m.weight || 0)), q: b.q + sign * Math.abs(Number(m.quantity || 0)) });
    }
    sample.set(key, m);
  }
  return [...bal.entries()].filter(([, b]) => b.w !== 0 || b.q !== 0).map(([key, b]) => {
    const s = sample.get(key);
    const incoming = b.w > 0 || (b.w === 0 && b.q >= 0);
    return {
      id: `carry-${key}`, item_id: s.item_id, warehouse_id: s.warehouse_id, Warehouse: s.Warehouse,
      movement_type: incoming ? 'إضافة' : 'صرف', quantity: Math.abs(b.q), weight: Math.abs(b.w), unit_price: 0,
      date: cutoff, description: 'رصيد مرحّل من سنة مقفولة', reference: '',
    };
  });
}

// Called by the auth middleware for every request. Does nothing for a user who may see closed years, for
// anything but a GET, and while no year is closed.
async function applyClosedView(req, res) {
  if (req.method !== 'GET' || canViewClosed(req.user)) return;
  const ranges = await closedRanges();
  if (!ranges.length) return;

  const url = (req.originalUrl || '').split('?')[0];
  const cutoff = ranges.map(r => r.end).sort().pop();       // end of the latest closed year
  const firstOpenDay = addDays(cutoff, 1);

  // lists and statements that take a start date begin at the first open day
  if (!req.query.from || String(req.query.from) < firstOpenDay) req.query.from = firstOpenDay;

  if (/\/finance\/checks\/overdue\/?$/.test(url)) return;   // a to-do alert, not history

  const orig = res.json.bind(res);
  res.json = (body) => {
    try {
      if (/\/stock\/movements\/[^/]+\/?$/.test(url) && Array.isArray(body)) {
        const hidden = body.filter(m => inRanges(m.date, ranges));
        const visible = body.filter(m => !inRanges(m.date, ranges));
        return orig([...carryForwardRows(hidden, cutoff), ...visible]);
      }
      if (Array.isArray(body)) return orig(body.filter(row => !(row && typeof row === 'object' && inRanges(row.date, ranges))));
      if (body && typeof body === 'object' && Array.isArray(body.rows)) {
        return orig({ ...body, rows: body.rows.filter(row => !(row && typeof row === 'object' && inRanges(row.date, ranges))) });
      }
      if (body && typeof body === 'object' && inRanges(body.date, ranges)) {
        res.status(403);
        return orig({ error: 'هذا المستند في سنة مالية مقفولة، ولا تملك صلاحية عرض السنوات المقفولة' });
      }
    } catch {
      // a filter that fails must not let closed-year rows through: refuse the read instead
      res.status(500);
      return orig({ error: 'تعذر عرض البيانات' });
    }
    return orig(body);
  };
}

module.exports = { applyClosedView, canViewClosed, closedRanges, inRanges, carryForwardRows };

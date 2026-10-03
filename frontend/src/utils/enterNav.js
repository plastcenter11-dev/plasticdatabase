// "Enter moves to the next field" for the data-entry forms. The scope is the
// enclosing modal (data-enter-scope, set by Modal) or, failing that, the
// enclosing <form>. Inputs outside either (search boxes, header filters) are
// left alone. Fields are visited in DOM order, which is also the visual order
// in this RTL layout; after the last field the focus lands on the form's save
// button, so a final Enter saves explicitly instead of by accident.

const SKIP_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'file', 'image']);

function isUsable(el) {
  if (el.disabled || el.readOnly || el.tabIndex < 0) return false;
  if (SKIP_TYPES.has(el.type)) return false;
  return el.getClientRects().length > 0;
}

export function enterScope(el) {
  return el.closest('[data-enter-scope]') || el.form || null;
}

export function focusNextField(from, step = 1) {
  const scope = enterScope(from);
  if (!scope) return false;
  const fields = [...scope.querySelectorAll('input, select, textarea')].filter(isUsable);
  const next = fields[fields.indexOf(from) + step];
  if (next) {
    next.focus();
    if (!next.classList.contains('erp-select')) { try { next.select?.(); } catch { /* not selectable */ } }
    return true;
  }
  if (step > 0) {
    const save = scope.querySelector('button[type="submit"]') || [...scope.querySelectorAll('button.erp-btn-primary')].pop();
    if (save && !save.disabled) { save.focus(); return true; }
  }
  return false;
}

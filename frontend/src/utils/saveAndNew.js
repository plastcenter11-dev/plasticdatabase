// After a NEW record is saved, its screen is closed and opened again, empty and with the cursor on the first field,
// so the next one can be typed straight away (Enter moves from field to field up to the save button, and Enter on
// it saves). Editing an existing record still just closes. The cancel / close button ends the series.

import { isUsableField } from './enterNav';

// the first field of the screen that is on top (a modal opened over another one comes last in the page)
export function focusFirstField(doc = globalThis.document) {
  const scopes = doc?.querySelectorAll('[data-enter-scope]');
  const scope = scopes && scopes[scopes.length - 1];
  if (!scope) return false;
  const first = [...scope.querySelectorAll('input, select, textarea')].find(isUsableField);
  if (!first) return false;
  first.focus();
  return true;
}

// close() and open() happen in separate turns, so what opens is really a new screen: nothing typed, chosen or
// remembered inside it is carried over.
export function saveAndNew(close, open, focus = focusFirstField) {
  close();
  setTimeout(() => {
    open();
    setTimeout(() => focus(), 60);   // after the new screen is on the page
  }, 0);
}

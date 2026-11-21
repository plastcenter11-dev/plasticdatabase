import { describe, it, expect, afterEach, vi } from 'vitest';
import { canRefreshNow } from './useAutoRefresh';

// a stand-in for the browser's document: only what the check reads
function fakeDocument({ hidden = false, formOpen = false, active = null } = {}) {
  vi.stubGlobal('document', {
    hidden,
    querySelector: (sel) => (sel === '[data-enter-scope]' && formOpen ? {} : null),
    activeElement: active,
  });
}

describe('when a screen may refresh itself', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes while the tab is visible and nothing is being edited', () => {
    fakeDocument({ active: { tagName: 'BODY' } });
    expect(canRefreshNow()).toBe(true);
  });

  it('does nothing while the tab is hidden', () => {
    fakeDocument({ hidden: true });
    expect(canRefreshNow()).toBe(false);
  });

  it('does nothing while a form window is open', () => {
    fakeDocument({ formOpen: true });
    expect(canRefreshNow()).toBe(false);
  });

  it('does nothing while somebody is typing in a field', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      fakeDocument({ active: { tagName } });
      expect(canRefreshNow()).toBe(false);
    }
    fakeDocument({ active: { tagName: 'DIV', isContentEditable: true } });
    expect(canRefreshNow()).toBe(false);
  });

  it('a button having the focus does not stop it', () => {
    fakeDocument({ active: { tagName: 'BUTTON' } });
    expect(canRefreshNow()).toBe(true);
  });
});

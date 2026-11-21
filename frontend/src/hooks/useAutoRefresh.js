import { useEffect, useRef } from 'react';

// Keeps a screen up to date when somebody else (another branch) changes the data:
//   - when the person comes back to the window or tab, the data is fetched again;
//   - while the screen stays open and visible, it is fetched again every `interval` ms.
// It stays out of the way: nothing happens while the tab is hidden, while a form window is open (the Modal
// component marks itself with data-enter-scope), while a field is being typed in, or while the previous
// refresh is still on its way, so what the person is typing is never disturbed and the server is never
// asked twice at once. The refresh is called as refresh({ silent: true }): a failed background refresh
// must not pop up an error message, the next one simply tries again.

export const MIN_GAP_MS = 5000;

function typingNow() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

// exported for the tests: is it a good moment to refresh?
export function canRefreshNow() {
  if (document.hidden) return false;
  if (document.querySelector('[data-enter-scope]')) return false;
  if (typingNow()) return false;
  return true;
}

export default function useAutoRefresh(refresh, { interval = 30000 } = {}) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let last = Date.now();
    let running = false;
    let stopped = false;

    const run = async () => {
      if (stopped || running || !canRefreshNow()) return;
      running = true;
      try { await latest.current({ silent: true }); } catch { /* the next round tries again */ }
      last = Date.now();
      running = false;
    };

    const timer = setInterval(run, interval);
    const onBack = () => { if (Date.now() - last >= MIN_GAP_MS) run(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [interval]);
}

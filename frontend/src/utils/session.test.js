import { describe, test, expect, beforeEach } from 'vitest';

// two tiny stand-ins for the browser's storages (no DOM needed)
const makeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let session, local;
const load = async () => { const { vi } = await import('vitest'); vi.resetModules(); return import('./session'); };
beforeEach(() => {
  session = makeStorage(); local = makeStorage();
  globalThis.sessionStorage = session; globalThis.localStorage = local;
});

const user = { id: 2, username: 'olaa', role: 'user', permissions: {} };

describe('the signed-in session', () => {
  test('lives in the window only: nothing is written to localStorage, so closing the browser signs out', async () => {
    const { sessionSave, sessionGet } = await load();
    sessionSave('tok', user);
    expect(session.getItem('token')).toBe('tok');
    expect(JSON.parse(session.getItem('user'))).toEqual(user);
    expect(local.getItem('token')).toBeNull();
    expect(local.getItem('user')).toBeNull();
    expect(sessionGet('token')).toBe('tok');
  });

  test('a session an older version left in localStorage is removed (never trusted), so those people sign in once more', async () => {
    local.setItem('token', 'old'); local.setItem('user', JSON.stringify(user));
    const { sessionGet } = await load();
    expect(sessionGet('token')).toBeNull();
    expect(local.getItem('token')).toBeNull();
    expect(local.getItem('user')).toBeNull();
  });

  test('signing out clears it', async () => {
    const { sessionSave, sessionClear, sessionGet } = await load();
    sessionSave('tok', user);
    sessionClear();
    expect(sessionGet('token')).toBeNull();
    expect(sessionGet('user')).toBeNull();
  });

  test('a browser that refuses storage does not crash the page', async () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    globalThis.sessionStorage = broken; globalThis.localStorage = broken;
    const { sessionSave, sessionGet, sessionClear } = await load();
    expect(() => sessionSave('t', user)).not.toThrow();
    expect(sessionGet('token')).toBeNull();
    expect(() => sessionClear()).not.toThrow();
  });
});

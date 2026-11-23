// Where the signed-in session (token + user) is kept in the browser: sessionStorage only. It goes away when the
// browser window is closed, so whoever opens the program next on that computer starts at the sign-in screen.
// (There is deliberately no "remember me": on a shared computer somebody would use it by mistake.)
//
// An older version kept the session in localStorage, where it survived closing the browser: whatever is still there
// is removed the first time this file loads, which signs those people out once.

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

for (const key of ['token', 'user']) safe(() => localStorage.removeItem(key));

export const sessionGet = (key) => safe(() => sessionStorage.getItem(key));

export function sessionSave(token, user) {
  safe(() => { sessionStorage.setItem('token', token); sessionStorage.setItem('user', JSON.stringify(user)); });
}

export function sessionClear() {
  for (const key of ['token', 'user']) { safe(() => sessionStorage.removeItem(key)); safe(() => localStorage.removeItem(key)); }
}

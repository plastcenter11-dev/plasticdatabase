import { useState } from 'react';

// Header-arrow sorting shared by the list pages: first click = smallest to
// largest, second = largest to smallest, third = off.
export function useSort() {
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(''); setSortDir('asc'); }
  };
  const resetSort = () => { setSortKey(''); setSortDir('asc'); };
  return { sortKey, sortDir, toggleSort, resetSort };
}

// Client-side sort for lists that are fully loaded. Numbers compare as numbers,
// text compares in Arabic with natural number order, and empty values always go
// last whichever direction is chosen.
export function sortRows(rows, key, dir, getVal) {
  if (!key) return rows;
  const d = dir === 'desc' ? -1 : 1;
  const empty = (v) => v == null || v === '';
  return [...rows].sort((x, y) => {
    const a = getVal(x, key), b = getVal(y, key);
    if (empty(a) || empty(b)) return (empty(a) ? 1 : 0) - (empty(b) ? 1 : 0);
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ar', { numeric: true });
    return c * d;
  });
}

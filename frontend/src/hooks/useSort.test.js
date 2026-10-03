import { describe, test, expect } from 'vitest';
import { sortRows } from './useSort';

const rows = [
  { id: 1, name: 'ب', qty: 5, width: 82 },
  { id: 2, name: 'أ', qty: 12, width: null },
  { id: 3, name: 'ج', qty: 1, width: 55 },
  { id: 4, name: 'د', qty: 12, width: '' },
];
const val = (r, k) => r[k];

describe('sortRows', () => {
  test('returns the rows untouched when no column is chosen', () => {
    expect(sortRows(rows, '', 'asc', val)).toBe(rows);
  });

  test('sorts numbers as numbers, smallest first then largest first', () => {
    expect(sortRows(rows, 'qty', 'asc', val).map(r => r.id)).toEqual([3, 1, 2, 4]);
    expect(sortRows(rows, 'qty', 'desc', val).map(r => r.id)).toEqual([2, 4, 1, 3]);
  });

  test('empty values go last in both directions', () => {
    expect(sortRows(rows, 'width', 'asc', val).map(r => r.id)).toEqual([3, 1, 2, 4]);
    expect(sortRows(rows, 'width', 'desc', val).map(r => r.id)).toEqual([1, 3, 2, 4]);
  });

  test('sorts Arabic text and keeps ties in their original order', () => {
    expect(sortRows(rows, 'name', 'asc', val).map(r => r.name)).toEqual(['أ', 'ب', 'ج', 'د']);
    expect(sortRows(rows, 'qty', 'asc', val).filter(r => r.qty === 12).map(r => r.id)).toEqual([2, 4]);
  });

  test('orders numbers inside text naturally (9 before 10)', () => {
    const items = [{ c: 'ITM-10' }, { c: 'ITM-9' }, { c: 'ITM-100' }];
    expect(sortRows(items, 'c', 'asc', val).map(r => r.c)).toEqual(['ITM-9', 'ITM-10', 'ITM-100']);
  });

  test('does not mutate the original array', () => {
    const copy = [...rows];
    sortRows(rows, 'qty', 'desc', val);
    expect(rows).toEqual(copy);
  });
});

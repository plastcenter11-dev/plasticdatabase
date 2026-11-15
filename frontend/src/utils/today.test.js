import { describe, it, expect } from 'vitest';
import { dayStr, todayStr, yearStartStr } from './today';

describe('local calendar days', () => {
  it('formats a local date without going through UTC', () => {
    // local midnight: toISOString() would give the previous day in any zone east of UTC
    expect(dayStr(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
    expect(dayStr(new Date(2026, 10, 15, 0, 30))).toBe('2026-11-15');
    expect(dayStr(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('pads months and days', () => {
    expect(dayStr(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('starts the year on 1 January', () => {
    expect(yearStartStr()).toBe(`${new Date().getFullYear()}-01-01`);
  });

  it('today matches the local date', () => {
    expect(todayStr()).toBe(dayStr(new Date()));
  });
});

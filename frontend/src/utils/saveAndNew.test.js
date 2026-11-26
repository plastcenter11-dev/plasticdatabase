import { describe, test, expect, vi, afterEach } from 'vitest';
import { saveAndNew, focusFirstField } from './saveAndNew';

afterEach(() => vi.useRealTimers());

describe('saveAndNew', () => {
  test('closes at once, opens a new screen in a later turn, then puts the cursor on its first field', () => {
    vi.useFakeTimers();
    const steps = [];
    saveAndNew(() => steps.push('close'), () => steps.push('open'), () => steps.push('focus'));
    expect(steps).toEqual(['close']);          // the old screen is gone before the new one is made
    vi.advanceTimersByTime(0);
    expect(steps).toEqual(['close', 'open']);
    vi.advanceTimersByTime(100);
    expect(steps).toEqual(['close', 'open', 'focus']);
  });
});

describe('focusFirstField', () => {
  const field = (over = {}) => ({ disabled: false, readOnly: false, tabIndex: 0, type: 'text', getClientRects: () => [1], focus: vi.fn(), ...over });
  const page = (...screens) => ({ querySelectorAll: () => screens.map((fields) => ({ querySelectorAll: () => fields })) });

  test('focuses the first field that can be typed in, of the screen on top', () => {
    const under = field(), hidden = field({ getClientRects: () => [] }), off = field({ disabled: true }), first = field(), second = field();
    expect(focusFirstField(page([under], [hidden, off, first, second]))).toBe(true);
    expect(first.focus).toHaveBeenCalled();
    expect(under.focus).not.toHaveBeenCalled();
    expect(second.focus).not.toHaveBeenCalled();
  });

  test('does nothing when no screen is open or it has no field', () => {
    expect(focusFirstField(page())).toBe(false);
    expect(focusFirstField(page([]))).toBe(false);
  });
});

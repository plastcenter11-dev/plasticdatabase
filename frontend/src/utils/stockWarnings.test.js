import { describe, test, expect, vi } from 'vitest';
import { shortageWarnings, withoutMovement, negativeWarnings, assemblyWarnings, confirmWarnings } from './stockWarnings';

const balances = [{ item_id: 1, warehouse_id: 10, weight: '100.00', quantity: '5' }, { item_id: 1, warehouse_id: 20, weight: '500', quantity: '0' }];
const line = (over = {}) => ({ item_id: 1, name: 'خامة', weight: 40, quantity: 1, ...over });

describe('shortageWarnings', () => {
  test('nothing when the warehouse holds enough, exactly enough included', () => {
    expect(shortageWarnings([line()], balances, 10)).toEqual([]);
    expect(shortageWarnings([line({ weight: 100 })], balances, 10)).toEqual([]);
  });
  test('says what is asked and what is there, in the chosen warehouse only', () => {
    const [w] = shortageWarnings([line({ weight: 150 })], balances, 10);
    expect(w).toContain('150');
    expect(w).toContain('100');
    expect(shortageWarnings([line({ weight: 150 })], balances, 20)).toEqual([]);
  });
  test('adds up two lines of the same item', () => {
    expect(shortageWarnings([line({ weight: 60 }), line({ weight: 60 })], balances, 10)).toHaveLength(1);
  });
  test('an item with nothing in that warehouse is short; a line with no weight is measured by its count', () => {
    expect(shortageWarnings([line({ item_id: 9 })], balances, 10)).toHaveLength(1);
    expect(shortageWarnings([line({ weight: 0, quantity: 6 })], balances, 10)).toHaveLength(1);
    expect(shortageWarnings([line({ weight: 0, quantity: 5 })], balances, 10)).toEqual([]);
  });
  test('non-stock lines, unread balances and no warehouse give no warning', () => {
    expect(shortageWarnings([line({ weight: 999, stockable: false })], balances, 10)).toEqual([]);
    expect(shortageWarnings([line({ weight: 999 })], null, 10)).toEqual([]);
    expect(shortageWarnings([line({ weight: 999 })], balances, null)).toEqual([]);
  });
});

test('editing an issue: its own weight is available again', () => {
  const adjusted = withoutMovement(balances, { item_id: 1, warehouse_id: 10, movement_type: 'صرف', weight: 50, quantity: 1 });
  expect(shortageWarnings([line({ weight: 150 })], adjusted, 10)).toEqual([]);
  expect(shortageWarnings([line({ weight: 151 })], adjusted, 10)).toHaveLength(1);
  expect(withoutMovement(balances, null)).toBe(balances);
});

test('negative weights and counts are pointed out', () => {
  expect(negativeWarnings([line({ weight: -40 }), line({ quantity: -1 }), line()])).toHaveLength(2);
});

describe('assemblyWarnings', () => {
  const items = [{ id: 1, name: 'أ', purchase_price: '10' }, { id: 2, name: 'بلا تكلفة', purchase_price: '0.00' }];
  test('a component with no cost', () => {
    const w = assemblyWarnings([{ item_id: 1, weight: 50 }, { item_id: 2, weight: 50 }], 100, items);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('بلا تكلفة');
  });
  test('output heavier than the inputs, counting material given back', () => {
    expect(assemblyWarnings([{ item_id: 1, weight: 10 }], 500, items)).toHaveLength(1);
    expect(assemblyWarnings([{ item_id: 1, weight: 100 }, { item_id: 1, weight: -10 }], 95, items)).toHaveLength(1);
    expect(assemblyWarnings([{ item_id: 1, weight: 100 }, { item_id: 1, weight: -10 }], 90, items)).toEqual([]);
  });
  test('expense lines and a lighter output are fine', () => {
    expect(assemblyWarnings([{ item_id: 1, weight: 100 }, { is_expense: true, quantity: 1, price: 5 }], 80, items)).toEqual([]);
  });
});

describe('confirmWarnings', () => {
  test('does not ask when there is nothing to say', () => {
    const ask = vi.fn();
    expect(confirmWarnings([], ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  test('asks once with every warning, and follows the answer', () => {
    const ask = vi.fn(() => false);
    expect(confirmWarnings(['أ', 'ب'], ask)).toBe(false);
    expect(ask.mock.calls[0][0]).toContain('• أ\n• ب');
  });
});

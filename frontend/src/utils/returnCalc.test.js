import { describe, test, expect } from 'vitest';
import { effectiveUnitNet } from './returnCalc';

describe('effectiveUnitNet', () => {
  test('no discount, no tax: matches the simple per-unit price', () => {
    const inv = { subtotal: 1000, discount: 0, tax_amount: 0 };
    const item = { weight: 100, price: 10, discount: 0 };
    const unit = effectiveUnitNet(item, inv, /* grossTotal */ 1000);
    expect(unit).toBeCloseTo(10);
  });

  test('a full return matches the invoice total exactly (single item, discount + tax)', () => {
    // One item on the invoice: 100kg @ 10/kg = 1000 gross, 5% invoice discount, 14% tax.
    const gross = 1000;
    const inv = { subtotal: 1000, discount: 50, tax_amount: 133 }; // (1000-50)*0.14 = 133
    const item = { weight: 100, price: 10, discount: 0 };
    const unit = effectiveUnitNet(item, inv, gross);
    // Returning the full 100kg should reproduce the invoice's actual total: 1000 - 50 + 133 = 1083.
    expect(unit * 100).toBeCloseTo(1083);
  });

  test('partial return scales proportionally with the same per-unit price', () => {
    const gross = 1000;
    const inv = { subtotal: 1000, discount: 50, tax_amount: 133 };
    const item = { weight: 100, price: 10, discount: 0 };
    const unit = effectiveUnitNet(item, inv, gross);
    // Returning half the weight should reverse exactly half the invoice's total.
    expect(unit * 50).toBeCloseTo(1083 / 2);
  });

  test('splits discount/tax proportionally across two items by their gross share', () => {
    // Item A: 100kg @ 10 = 1000 gross. Item B: 50kg @ 20 = 1000 gross. Combined gross = 2000.
    const gross = 2000;
    const inv = { subtotal: 2000, discount: 200, tax_amount: 252 }; // (2000-200)*0.14 = 252
    const itemA = { weight: 100, price: 10, discount: 0 };
    const itemB = { weight: 50, price: 20, discount: 0 };
    const unitA = effectiveUnitNet(itemA, inv, gross);
    const unitB = effectiveUnitNet(itemB, inv, gross);
    // Each item has an equal 50% gross share, so each should absorb half the discount and half the tax.
    const totalA = unitA * 100;
    const totalB = unitB * 50;
    expect(totalA).toBeCloseTo(totalB);
    expect(totalA + totalB).toBeCloseTo(2000 - 200 + 252);
  });

  test('a line-level item discount is applied before the invoice-level share', () => {
    const gross = 1000;
    // Item has its own 10% line discount: net = 100*10*(1-0.10) = 900. Invoice subtotal reflects that net.
    const inv = { subtotal: 900, discount: 90, tax_amount: 113.4 }; // (900-90)*0.14
    const item = { weight: 100, price: 10, discount: 10 };
    const unit = effectiveUnitNet(item, inv, gross);
    expect(unit * 100).toBeCloseTo(900 - 90 + 113.4);
  });

  test('zero weight and zero quantity returns 0 rather than dividing by zero', () => {
    const inv = { subtotal: 1000, discount: 50, tax_amount: 100 };
    const item = { weight: 0, quantity: 0, price: 10, discount: 0 };
    expect(effectiveUnitNet(item, inv, 1000)).toBe(0);
  });

  test('falls back to quantity when weight is absent (non-stockable items)', () => {
    const inv = { subtotal: 500, discount: 0, tax_amount: 0 };
    const item = { quantity: 5, price: 100, discount: 0 };
    const unit = effectiveUnitNet(item, inv, 500);
    expect(unit).toBeCloseTo(100);
  });
});

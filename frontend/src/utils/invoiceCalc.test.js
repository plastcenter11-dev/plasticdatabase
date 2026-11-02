import { describe, test, expect } from 'vitest';
import { lineGross, lineDiscount, lineTotal, invoiceTotals, expectedBalance } from './invoiceCalc';

describe('invoice lines', () => {
  test('a line is weight x price, never quantity x price', () => {
    expect(lineGross({ weight: 50, price: 20, quantity: 3 })).toBe(1000);
  });

  test('a line without a weight is worth nothing', () => {
    expect(lineGross({ weight: '', price: 20 })).toBe(0);
    expect(lineGross({ weight: 10, price: '' })).toBe(0);
    expect(lineGross({})).toBe(0);
  });

  test('the line discount is a percentage of the line', () => {
    expect(lineDiscount({ weight: 100, price: 10, discount: 10 })).toBe(100);
    expect(lineTotal({ weight: 100, price: 10, discount: 10 })).toBe(900);
    expect(lineTotal({ weight: 100, price: 10, discount: 0 })).toBe(1000);
    expect(lineTotal({ weight: 100, price: 10 })).toBe(1000);
  });

  test('text from the inputs is handled as numbers', () => {
    expect(lineTotal({ weight: '100', price: '10', discount: '5' })).toBe(950);
  });
});

describe('invoice totals', () => {
  const items = [
    { weight: 100, price: 10, discount: 10 }, // 1000 gross, 900 net
    { weight: 50, price: 20, discount: 0 },   // 1000 gross, 1000 net
  ];

  test('no discount, no tax: the total is the sum of the lines', () => {
    expect(invoiceTotals(items)).toEqual({ gross: 2000, subtotal: 1900, discount: 0, tax: 0, total: 1900 });
  });

  test('the header discount is a fixed amount off the subtotal', () => {
    const t = invoiceTotals(items, { discount: 150 });
    expect(t.discount).toBe(150);
    expect(t.total).toBe(1750);
  });

  test('tax is charged on the gross, before line discounts', () => {
    const t = invoiceTotals(items, { tax_rate: 14 });
    expect(t.tax).toBe(280);          // 14% of 2000, not of 1900
    expect(t.total).toBe(1900 + 280);
  });

  test('line discount, header discount and tax together', () => {
    const t = invoiceTotals(items, { discount: 100, tax_rate: 14 });
    expect(t.total).toBe(1900 - 100 + 280);
  });

  test('an empty invoice is zero', () => {
    expect(invoiceTotals([], { discount: 0, tax_rate: 14 })).toEqual({ gross: 0, subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  test('a blank tax rate or discount counts as zero', () => {
    const t = invoiceTotals(items, { discount: '', tax_rate: '' });
    expect(t.total).toBe(1900);
  });

  test('the total can go negative when the discount is bigger than the invoice', () => {
    expect(invoiceTotals(items, { discount: 5000 }).total).toBe(-3100);
  });
});

describe('expected balance', () => {
  test('balance plus the rounded total minus what is paid', () => {
    expect(expectedBalance(1000, 1900.4, 500)).toBe(2400);
    expect(expectedBalance(1000, 1900.6, 500)).toBe(2401);
  });

  test('fully paid leaves the balance as it was', () => {
    expect(expectedBalance(300, 1000, 1000)).toBe(300);
  });

  test('a customer who is owed money (negative balance) is reduced by the invoice', () => {
    expect(expectedBalance(-400, 1000, 0)).toBe(600);
  });

  test('a blank paid field counts as nothing paid', () => {
    expect(expectedBalance(0, 1000, '')).toBe(1000);
  });
});

import { describe, test, expect } from 'vitest';
import { lineGross, lineDiscount, lineTotal, invoiceTotals, expectedBalance, round2 } from './invoiceCalc';

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

  test('tax is charged on the subtotal after the line discounts (the taxable base)', () => {
    const t = invoiceTotals(items, { tax_rate: 14 });
    expect(t.tax).toBe(266);          // 14% of 1900, not of the 2000 gross
    expect(t.total).toBe(1900 + 266);
  });

  test('the header discount also lowers the taxable base', () => {
    const t = invoiceTotals(items, { discount: 100, tax_rate: 14 });
    expect(t.tax).toBe(252);          // 14% of (1900 - 100)
    expect(t.total).toBe(1900 - 100 + 252);
  });

  test('the figures from the audit: 50,000 gross, 5% line discount, 100 header discount', () => {
    const t = invoiceTotals([{ weight: 1000, price: 50, discount: 5 }], { discount: 100, tax_rate: 14 });
    expect(t.subtotal).toBe(47500);
    expect(t.tax).toBe(6636);         // 14% of 47,400, not 7,000
    expect(t.total).toBe(47500 - 100 + 6636);
  });

  test('money is kept to the piastre, not rounded to the pound', () => {
    const t = invoiceTotals([{ weight: 1, price: 220 }], { tax_rate: 14 });
    expect(t.tax).toBe(30.8);         // used to be saved as 31
    expect(t.total).toBe(250.8);
    const u = invoiceTotals([{ weight: 3, price: 33.335 }], { tax_rate: 14 });
    expect(u.total).toBe(round2(u.subtotal + u.tax));
  });

  test('a tax that is not a whole number of piastres is rounded to the piastre', () => {
    const t = invoiceTotals([{ weight: 1, price: 10.01 }], { tax_rate: 14 });
    expect(t.tax).toBe(1.4);          // 1.4014
    expect(t.total).toBe(11.41);
  });

  test('a discount bigger than the invoice gives no negative tax', () => {
    expect(invoiceTotals(items, { discount: 5000, tax_rate: 14 }).tax).toBe(0);
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
  test('balance plus the total minus what is paid, to the piastre', () => {
    expect(expectedBalance(1000, 1900.4, 500)).toBe(2400.4);
    expect(expectedBalance(1000, 1900.6, 500)).toBe(2400.6);
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

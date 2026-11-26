import { describe, it, expect } from 'vitest';
import { repCommission, platesOf, isPlate, soldKg } from './repCommission';

const inv = (subtotal, tax_rate, debit, items) => ({ type: 'فاتورة بيع', subtotal, tax_rate, debit, credit: 0, items });
const line = (name, total) => ({ Item: { name }, total });

describe('rep commission', () => {
  it('recognises cliché and cylinder item names', () => {
    for (const n of ['اكلاشيه', 'أكلاشيه', 'كليشيه', 'اكلشيه', 'سلندر', 'سلندرات', 'سليندر']) expect(isPlate(n)).toBe(true);
    for (const n of ['فلامنكو', 'دشت', 'بيلادونا']) expect(isPlate(n)).toBe(false);
  });

  it('deducts a cliché at its billed value (incl. VAT), not the pre-tax line', () => {
    expect(platesOf(inv(300600, 14, 342684, [line('اكلاشيه', 300600)]))).toBeCloseTo(342684, 2);
    expect(platesOf(inv(20000, 0, 20000, [line('اكلاشيه', 20000)]))).toBeCloseTo(20000, 2);
  });

  it('takes the cliché share after the invoice header discount', () => {
    // 1000 goods + 1000 cliché, 200 discount, 14% VAT on 1800 → 2052; cliché half = 1026
    expect(platesOf(inv(2000, 14, 2052, [line('فلامنكو', 1000), line('سلندر', 1000)]))).toBeCloseTo(1026, 2);
  });

  it('matches the فلامنكو figures checked by the user (Nov 2026)', () => {
    const rows = [
      { isOpening: true, balance: 0, debit: 0, credit: 0 },
      inv(1287500, 14, 1467750, [line('فلامنكو', 1287500)]),
      inv(20000, 0, 20000, [line('اكلاشيه', 20000)]),
      { type: 'تحصيل', debit: 0, credit: 400000 },
      { type: 'مرتجع بيع', debit: 0, credit: 142500 },
      { type: 'شيك', debit: 0, credit: 67750 },
      { type: 'شيك مرتد', debit: 67750, credit: 0 },
      inv(1000000, 14, 1140000, [line('فلامنكو', 1000000)]),
      inv(300600, 14, 342684, [line('اكلاشيه', 300600)]),
    ];
    const c = repCommission(rows, 1.5);
    expect(c.paid).toBe(467750);
    expect(c.bounced).toBe(67750);
    expect(c.returns).toBe(142500);
    expect(c.plates).toBeCloseTo(362684, 2);
    expect(c.base).toBeCloseTo(-105184, 2);
    expect(c.exTax).toBeCloseTo(-92266.67, 2);
    expect(c.commission).toBeCloseTo(-1384, 2);
  });

  it('divides by 1.14 even when the invoices were saved without tax: the prices include VAT', () => {
    // the real case: invoices saved at 0% tax, 270,000 collected
    const rows = [inv(1166900, 0, 1166900, [line('سكول', 1166900)]), { type: 'تحصيل', credit: 120000 }, { type: 'تحصيل', credit: 150000 }];
    const c = repCommission(rows, 1.5);
    expect(c.base).toBe(270000);
    expect(c.divisor).toBe(1.14);
    expect(c.exTax).toBeCloseTo(236842.11, 2);
    expect(c.commission).toBeCloseTo(3552.63, 2);
  });

  it('takes cash paid back to the customer off the payments, like a cash discount', () => {
    const rows = [
      inv(10000, 0, 10000, [line('فلامنكو', 10000)]),
      { type: 'تحصيل', debit: 0, credit: 10000 },
      { type: 'خصم نقدي', debit: 0, credit: 500 },
      { type: 'رد نقدية', debit: 1000, credit: 0 },
    ];
    const c = repCommission(rows, 1);
    expect(c.returns).toBe(1500);
    expect(c.base).toBe(8500);
    expect(c.commission).toBeCloseTo(8500 / 1.14 / 100, 6);
  });

  it('is the same 1.14 whatever mix of invoices the customer has, or none at all', () => {
    const mixed = [inv(10000, 14, 11400, [line('فلامنكو', 10000)]), inv(10000, 0, 10000, [line('دشت', 10000)]), { type: 'تحصيل', credit: 21400 }];
    expect(repCommission(mixed, 1).exTax).toBeCloseTo(21400 / 1.14, 2);
    expect(repCommission([{ type: 'تحصيل', credit: 1140 }], 10).exTax).toBeCloseTo(1000, 6);
  });

  it('counts cash discount with returns and ignores the opening row', () => {
    const c = repCommission([{ isOpening: true, credit: 999, debit: 999 }, { type: 'تحصيل', credit: 1140 }, { type: 'خصم نقدي', credit: 114 }], 10);
    expect(c.base).toBe(1026);
    expect(c.commission).toBeCloseTo(90, 2);
  });
});

describe('sold kilograms', () => {
  const w = (name, weight, is_stockable) => ({ Item: { name, is_stockable }, weight });

  it('skips every non-stock line, whatever its name', () => {
    expect(soldKg([w('فلامنكو', 100, true), w('اكلاشيه', 5, false), w('سلندرات', 2, false), w('دشت', 3, false), w('خدمة جديدة', 4, false)])).toBe(100);
  });

  it('counts a stock item even if its name looks like a cliché', () => {
    expect(soldKg([w('اكلاشيه مخزني', 7, true), w('فلامنكو', 10, true)])).toBe(17);
  });

  it('falls back to the cliché name rule when the statement sent no stock flag', () => {
    expect(soldKg([w('فلامنكو', 100), w('اكلاشيه', 5)])).toBe(100);
  });

  it('tolerates a missing weight, item or list', () => {
    expect(soldKg([w('فلامنكو', 40, true), w('دشت', 10, true), { Item: { name: 'بيلادونا', is_stockable: true } }])).toBe(50);
    expect(soldKg(undefined)).toBe(0);
  });
});

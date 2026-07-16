// Unit Tests — الحسابات المالية لفواتير الشراء والمرتجع

// ===== دوال الحساب (مستخرجة من منطق الفرونت‑إند والباك‑إند) =====

const lineDiscount = (weight, price, discPct) =>
  weight * price * (discPct / 100);

const calcGross = (items) =>
  items.reduce((sum, i) => sum + (i.weight * i.price), 0);

const calcSubtotal = (items) =>
  items.reduce((sum, i) => sum + (i.weight * i.price - lineDiscount(i.weight, i.price, i.discount || 0)), 0);

const calcTax = (subtotal, invoiceDiscount, taxRate) =>
  (subtotal - invoiceDiscount) * (taxRate / 100);

const calcTotal = (subtotal, invoiceDiscount, taxRate) =>
  subtotal - invoiceDiscount + calcTax(subtotal, invoiceDiscount, taxRate);

const supplierDebt = (total, paid) => total - paid;

const proportionalDiscount = (invoiceDiscount, returnSubtotal, invoiceSubtotal) =>
  invoiceSubtotal > 0 ? invoiceDiscount * (returnSubtotal / invoiceSubtotal) : 0;

const returnTotal = (returnSubtotal, invDiscount, invSubtotal, taxRate) => {
  const disc = proportionalDiscount(invDiscount, returnSubtotal, invSubtotal);
  const tax = (returnSubtotal - disc) * (taxRate / 100);
  return returnSubtotal - disc + tax;
};

// ===== TESTS =====

describe('lineDiscount', () => {
  test('حساب الخصم الصحيح: 100kg × 10ج.م × 5%', () => {
    expect(lineDiscount(100, 10, 5)).toBeCloseTo(50);
  });
  test('خصم 0% يرجع 0', () => {
    expect(lineDiscount(100, 10, 0)).toBe(0);
  });
  test('وزن 0 يرجع 0', () => {
    expect(lineDiscount(0, 10, 5)).toBe(0);
  });
  test('سعر 0 يرجع 0', () => {
    expect(lineDiscount(100, 0, 5)).toBe(0);
  });
  test('خصم 100% يساوي كامل المبلغ', () => {
    expect(lineDiscount(50, 20, 100)).toBe(1000);
  });
});

describe('calcGross', () => {
  test('مجموع (وزن × سعر) لبندين', () => {
    const items = [{ weight: 100, price: 10 }, { weight: 50, price: 20 }];
    expect(calcGross(items)).toBe(2000);
  });
  test('قائمة فاضية ترجع 0', () => {
    expect(calcGross([])).toBe(0);
  });
  test('صنف واحد', () => {
    expect(calcGross([{ weight: 200, price: 15 }])).toBe(3000);
  });
});

describe('calcSubtotal (بعد خصم البنود)', () => {
  test('بدون خصم = نفس الـ gross', () => {
    const items = [{ weight: 100, price: 10, discount: 0 }];
    expect(calcSubtotal(items)).toBe(1000);
  });
  test('خصم 10% على بند واحد', () => {
    const items = [{ weight: 100, price: 10, discount: 10 }];
    expect(calcSubtotal(items)).toBeCloseTo(900);
  });
  test('بندين بخصومات مختلفة', () => {
    const items = [
      { weight: 100, price: 10, discount: 10 }, // 900
      { weight: 50,  price: 20, discount: 5  }, // 950
    ];
    expect(calcSubtotal(items)).toBeCloseTo(1850);
  });
  test('discount undefined يُعامَل كـ 0', () => {
    const items = [{ weight: 100, price: 10 }];
    expect(calcSubtotal(items)).toBe(1000);
  });
});

describe('calcTax', () => {
  test('ضريبة 14% على 1000 بدون خصم = 140', () => {
    expect(calcTax(1000, 0, 14)).toBeCloseTo(140);
  });
  test('ضريبة 14% على 1000 بعد خصم 100 = 126', () => {
    expect(calcTax(1000, 100, 14)).toBeCloseTo(126);
  });
  test('ضريبة 0% ترجع 0', () => {
    expect(calcTax(1000, 0, 0)).toBe(0);
  });
  test('خصم أكبر من الـ subtotal يرجع ضريبة سالبة — منطق إنذار', () => {
    expect(calcTax(100, 200, 14)).toBeLessThan(0);
  });
});

describe('calcTotal', () => {
  test('إجمالي: 1000 subtotal، 0 خصم، 14% ضريبة = 1140', () => {
    expect(calcTotal(1000, 0, 14)).toBeCloseTo(1140);
  });
  test('إجمالي: 1000 subtotal، 100 خصم، 14% ضريبة = 1026', () => {
    expect(calcTotal(1000, 100, 14)).toBeCloseTo(1026);
  });
  test('بدون ضريبة وبدون خصم = نفس الـ subtotal', () => {
    expect(calcTotal(500, 0, 0)).toBe(500);
  });
});

describe('supplierDebt (رصيد المورد بعد الترحيل)', () => {
  test('مدفوع 0 → كامل المبلغ دين', () => {
    expect(supplierDebt(1000, 0)).toBe(1000);
  });
  test('مدفوع كامل → دين = 0', () => {
    expect(supplierDebt(1000, 1000)).toBe(0);
  });
  test('مدفوع جزء → الباقي دين', () => {
    expect(supplierDebt(1000, 400)).toBe(600);
  });
  test('مدفوع أكبر من الإجمالي → رصيد دائن سالب', () => {
    expect(supplierDebt(1000, 1200)).toBe(-200);
  });
});

describe('proportionalDiscount (خصم المرتجع التناسبي)', () => {
  test('مرتجع 50% من الفاتورة → خصم 50% من خصم الفاتورة', () => {
    expect(proportionalDiscount(200, 500, 1000)).toBeCloseTo(100);
  });
  test('مرتجع كامل الفاتورة → كامل الخصم', () => {
    expect(proportionalDiscount(200, 1000, 1000)).toBeCloseTo(200);
  });
  test('لا خصم في الفاتورة → 0', () => {
    expect(proportionalDiscount(0, 500, 1000)).toBe(0);
  });
  test('invoice_subtotal = 0 لا يقسم → يرجع 0', () => {
    expect(proportionalDiscount(200, 500, 0)).toBe(0);
  });
});

describe('returnTotal (إجمالي المرتجع مع الضريبة والخصم)', () => {
  test('مرتجع بدون ضريبة وبدون خصم = return_subtotal', () => {
    expect(returnTotal(1000, 0, 1000, 0)).toBe(1000);
  });
  test('مرتجع 100% من فاتورة 1000 subtotal، خصم 100، ضريبة 14%', () => {
    // (1000 - 100) × 1.14 = 1026
    expect(returnTotal(1000, 100, 1000, 14)).toBeCloseTo(1026);
  });
  test('مرتجع 50% من فاتورة 1000 subtotal، خصم 100، ضريبة 14%', () => {
    // returnSub=500, propDisc=50, tax=(500-50)×0.14=63, total=500-50+63=513
    expect(returnTotal(500, 100, 1000, 14)).toBeCloseTo(513);
  });
  test('ضريبة بدون خصم', () => {
    // 500 × 1.14 = 570
    expect(returnTotal(500, 0, 1000, 14)).toBeCloseTo(570);
  });
});

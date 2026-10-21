const { describeError, errorStatus } = require('../../utils/errors');

const unique = (path, value) => ({ name: 'SequelizeUniqueConstraintError', message: 'Validation error', errors: [{ path, value }], fields: { [path]: value } });

describe('describeError', () => {
  test('a duplicate document number names the field and the value', () => {
    expect(describeError(unique('invoice_no', '23'))).toBe('رقم الفاتورة «23» مستخدم من قبل');
    expect(describeError(unique('code', 'ITM-0001'))).toBe('الكود «ITM-0001» مستخدم من قبل');
  });

  test('the field is read from a "table.column" key too', () => {
    expect(describeError(unique('sales_invoices.invoice_no', '7'))).toBe('رقم الفاتورة «7» مستخدم من قبل');
  });

  test('a missing required field says which one', () => {
    const err = { name: 'SequelizeValidationError', message: 'notNull Violation: Expense.date cannot be null', errors: [{ type: 'notNull Violation', path: 'date', message: 'Expense.date cannot be null' }] };
    expect(describeError(err)).toBe('الحقل «التاريخ» مطلوب');
  });

  test('several problems are listed together', () => {
    const err = { name: 'SequelizeValidationError', errors: [
      { type: 'notNull Violation', path: 'amount' }, { type: 'notNull Violation', path: 'description' },
    ] };
    expect(describeError(err)).toBe('الحقل «المبلغ» مطلوب، الحقل «الوصف» مطلوب');
  });

  test('a foreign-key failure is explained', () => {
    expect(describeError({ name: 'SequelizeForeignKeyConstraintError', message: 'x' })).toMatch(/مرتبط/);
  });

  test('anything else keeps its own message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError(null)).toBe('خطأ');
  });
});

describe('errorStatus', () => {
  test('bad input is a 400, a real failure stays a 500', () => {
    expect(errorStatus(unique('invoice_no', '1'))).toBe(400);
    expect(errorStatus({ name: 'SequelizeValidationError' })).toBe(400);
    expect(errorStatus(new Error('db down'))).toBe(500);
  });
});

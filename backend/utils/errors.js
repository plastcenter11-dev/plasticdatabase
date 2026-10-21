'use strict';

// Turns the errors Sequelize throws into something a person can act on.
// A duplicate document number used to come back as the bare text "Validation
// error", a missing required field as "Invoice.date cannot be null", and so on.

const FIELD_LABELS = {
  invoice_no: 'رقم الفاتورة', receipt_no: 'رقم السند', payment_no: 'رقم السند', return_no: 'رقم المرتجع',
  note_no: 'رقم الإذن', check_no: 'رقم الشيك', code: 'الكود', username: 'اسم المستخدم', name: 'الاسم',
  date: 'التاريخ', amount: 'المبلغ', quantity: 'العدد', weight: 'الوزن', price: 'السعر', total: 'الإجمالي',
  description: 'الوصف', customer_id: 'العميل', supplier_id: 'المورد', item_id: 'الصنف', warehouse_id: 'المخزن',
  party_id: 'الطرف', party_type: 'نوع الطرف', due_date: 'تاريخ الاستحقاق', movement_type: 'نوع الحركة',
  start_date: 'تاريخ البداية', end_date: 'تاريخ النهاية',
};

const label = (path) => {
  const key = String(path || '').split('.').pop();
  return FIELD_LABELS[key] || key;
};

function describeError(err) {
  if (!err) return 'خطأ';
  const first = err.errors && err.errors[0];
  switch (err.name) {
    case 'SequelizeUniqueConstraintError': {
      const fields = err.fields || {};
      const path = (first && first.path) || Object.keys(fields)[0] || '';
      const value = first && first.value != null ? first.value : Object.values(fields)[0];
      return value != null && value !== '' ? `${label(path)} «${value}» مستخدم من قبل` : `${label(path)} مستخدم من قبل`;
    }
    case 'SequelizeValidationError': {
      const parts = (err.errors || []).map(e => (e.type === 'notNull Violation' ? `الحقل «${label(e.path)}» مطلوب` : e.message));
      return parts.length ? parts.join('، ') : err.message;
    }
    case 'SequelizeForeignKeyConstraintError':
      return 'السجل مرتبط ببيانات أخرى، أو يشير إلى سجل غير موجود';
    default:
      return err.message;
  }
}

// bad input is the caller's to fix (400); anything else is a real server error
function errorStatus(err) {
  return err && (err.name === 'SequelizeUniqueConstraintError' || err.name === 'SequelizeValidationError') ? 400 : 500;
}

module.exports = { describeError, errorStatus };

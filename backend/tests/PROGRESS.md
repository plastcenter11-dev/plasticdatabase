# Test progress (options / protection work, 2026-10-29)

Run one file at a time, smallest first: `npx jest tests/integration/<file> --runInBand --forceExit --testTimeout=900000`

| file | tests | result |
|---|---|---|
| options.test.js | 11 | PASS (11/11) |
| invoiceWarehouseGuard | 4 | PASS (4/4, 222 s) |
| financialYears | 5 | PASS (5/5, 231 s) |
| invoiceListPaging | 6 | PASS (6/6, 278 s) |
| deliveryNotes | 14 | PASS (14/14, 589 s) |
| purchaseInvoices | 14 | PASS (14/14, 3 s - the machine got fast again) |
| salesInvoices | 17 | PASS (17/17, 672 s) |
| permissions | 25 | PASS (25/25) |

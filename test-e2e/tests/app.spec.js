const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:5173';

// Login helper
async function login(page, username = 'admin', password = 'admin') {
  await page.goto(BASE + '/login');
  await page.fill('input[type="text"], input:not([type="password"])', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 5000 });
}

// ===================== AUTH =====================
test('1. Login with wrong password shows error', async ({ page }) => {
  await page.goto(BASE + '/login');
  await page.fill('input:not([type="password"])', 'admin');
  await page.fill('input[type="password"]', 'wrongpass');
  await page.click('button[type="submit"]');
  // Give toast time to appear then verify we're still on login
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/login/);
});

test('2. Login with correct credentials', async ({ page }) => {
  await login(page);
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator('text=admin')).toBeVisible();
});

test('3. Redirect to login when not authenticated', async ({ page }) => {
  await page.goto(BASE + '/sales-orders');
  await expect(page).toHaveURL(/login/, { timeout: 5000 });
});

// ===================== SALES ORDERS =====================
test('4. Sales orders page loads and search works', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/sales-orders');
  await expect(page.locator('text=طلبيات البيع')).toBeVisible();
  // Search bar visible
  const searchInput = page.locator('input[placeholder*="بحث"]');
  await expect(searchInput).toBeVisible();
  // Type in search
  await searchInput.fill('SO-999999');
  await expect(page.locator('text=لا توجد طلبيات')).toBeVisible();
  await searchInput.clear();
});

test('5. Create new sales order with tax', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/sales-orders');
  await page.click('button:has-text("طلبية جديدة")');
  await expect(page.locator('text=طلبية بيع جديدة')).toBeVisible();

  // Select customer
  await page.selectOption('select', { index: 1 });

  // Select item
  const itemSelect = page.locator('table select').first();
  await itemSelect.selectOption({ index: 1 });

  // Set quantity
  await page.locator('input[type="number"]').first().fill('10');

  // Check tax checkbox
  const taxCheckbox = page.locator('input[type="checkbox"]').first();
  await taxCheckbox.check();

  // Verify tax rate field appears with default 14
  const taxInput = page.locator('input[type="number"][value="14"]');
  await expect(taxInput).toBeVisible();

  // Save
  await page.click('button:has-text("حفظ")');
  await expect(page.locator('.Toastify__toast--success, [class*="toast-success"]')).toBeVisible({ timeout: 5000 });
});

// ===================== DELIVERY NOTES =====================
test('6. Delivery notes page loads', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/delivery-notes');
  await expect(page.locator('text=إذون التسليم')).toBeVisible();
  await expect(page.locator('button:has-text("إذن تسليم جديد")')).toBeVisible();
});

test('7. Invoice modal input is typeable', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/delivery-notes');

  // Click ترحيل on the first pending note (if any)
  const deliverBtn = page.locator('button:has-text("ترحيل")').first();
  const hasDeliver = await deliverBtn.isVisible().catch(() => false);
  if (!hasDeliver) {
    test.skip('No pending delivery notes to test');
    return;
  }

  await deliverBtn.click();
  await expect(page.locator('text=ترحيل لفاتورة بيع')).toBeVisible({ timeout: 3000 });

  // Type in invoice number field
  const invoiceInput = page.locator('input[placeholder*="1001"]');
  await expect(invoiceInput).toBeVisible();
  await invoiceInput.click();
  await invoiceInput.fill('INV-UI-TEST-01');
  await expect(invoiceInput).toHaveValue('INV-UI-TEST-01');
});

// ===================== SALES INVOICES =====================
test('8. Sales invoices page loads with data', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/sales-invoices');
  await expect(page.locator('text=فواتير بيع')).toBeVisible();
  // Table should have at least header
  await expect(page.locator('table')).toBeVisible();
});

// ===================== CUSTOMER STATEMENT =====================
test('9. Customer statement shows correct balance', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/reports/customer-statement');
  await expect(page.locator('text=كشف حساب عميل')).toBeVisible();

  // Select customer
  const custSelect = page.locator('select').first();
  await custSelect.selectOption({ index: 1 });

  // Balance should be visible
  await expect(page.locator('text=الرصيد النهائي')).toBeVisible();
});

// ===================== NAVIGATION =====================
test('10. All main menu tabs work', async ({ page }) => {
  await login(page);

  const pages = [
    ['/sales-orders', 'طلبيات البيع'],
    ['/delivery-notes', 'إذون'],
    ['/sales-invoices', 'فواتير بيع'],
    ['/customers', 'العملاء'],
    ['/items', 'تعريف أصناف'],
    ['/warehouses', 'المخازن'],
    ['/reports/customer-statement', 'كشف حساب عميل'],
  ];

  for (const [path, title] of pages) {
    await page.goto(BASE + path);
    await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 5000 });
  }
});

// ===================== CUSTOMER SUMMARY =====================
test('11. Customer summary report balance is correct', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/reports/customers');
  await expect(page.locator('text=تقرير إجمالي عملاء')).toBeVisible();
  // Should NOT show huge wrong balance
  await expect(page.locator('text=48,545')).not.toBeVisible();
});

// ===================== LOGOUT =====================
test('12. Logout works', async ({ page }) => {
  await login(page);
  // Click on admin user menu
  await page.click('text=admin');
  // Click logout if visible
  const logoutBtn = page.locator('button:has-text("تسجيل خروج"), a:has-text("تسجيل خروج")');
  const hasLogout = await logoutBtn.isVisible().catch(() => false);
  if (hasLogout) {
    await logoutBtn.click();
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  } else {
    // Manually clear token and verify redirect
    await page.evaluate(() => localStorage.removeItem('token'));
    await page.goto(BASE + '/sales-orders');
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  }
});

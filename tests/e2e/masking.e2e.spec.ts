import { test, expect } from '../fixtures/auth.fixture';
import { getDataEngineerEditor, getDataEngineerApprover } from '../helpers/users-loader';

/**
 * @deprecated — RETIRED (Phase 3, F15)
 *
 * This file has been superseded by the comprehensive E2E-Frontend-Only masking suite:
 *   tests/E2E-Frontend-Only/masking/masking-dashboard.spec.ts   (6 tests)
 *   tests/E2E-Frontend-Only/masking/masking-create.spec.ts      (8 tests)
 *   tests/E2E-Frontend-Only/masking/masking-edit.spec.ts        (4 tests)
 *   tests/E2E-Frontend-Only/masking/masking-review.spec.ts      (6 tests)
 *   tests/E2E-Frontend-Only/masking/masking-rbac.spec.ts        (7 tests)
 *   tests/E2E-Frontend-Only/masking/masking-maker-checker.spec.ts (7 tests)
 *
 * Run the new suite: npx playwright test --project=e2e-frontend-only
 *
 * This file is kept as a reference only. All tests are skipped.
 */
test.describe.skip('RETIRED — see tests/E2E-Frontend-Only/masking/', () => {
// Original file content preserved below for reference.

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

test.describe.serial('Masking E2E — Page Navigation @smoke @e2e', () => {
  test('Login page loads correctly @smoke @e2e', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/login`);
    await page.screenshot({ path: 'test-results/screenshots/login_01_page-load.png' });

    expect.soft(page.url()).toContain('/login');

    const emailInput = page.getByLabel('Email Address');
    const passwordInput = page.getByLabel('Password');
    const loginButton = page.getByRole('button', { name: /login/i });

    expect.soft(await emailInput.isVisible(), 'Email input should be visible').toBe(true);
    await page.screenshot({ path: 'test-results/screenshots/login_02_form-visible.png' });

    expect.soft(await passwordInput.isVisible(), 'Password input should be visible').toBe(true);
    expect.soft(await loginButton.isVisible(), 'Login button should be visible').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/login_03_all-elements.png' });
    await context.close();
  });

  test('Login with Data Engineer Editor credentials @smoke @e2e', async ({ browser }) => {
    const user = getDataEngineerEditor();
    test.skip(!user, 'Data Engineer Editor user not found');

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/login`);
    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_01_start.png' });

    await page.getByLabel('Email Address').fill(user!.email);
    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_02_email-filled.png' });

    await page.getByLabel('Password').fill(user!.password);
    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_03_password-filled.png' });

    await page.getByRole('button', { name: /login/i }).click();
    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_04_clicked.png' });

    // Wait for navigation after login
    await page.waitForURL('**/home**', { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_05_after-redirect.png' });

    expect.soft(page.url(), 'Should redirect to /home after login').toContain('/home');

    const hasToken = await page.evaluate(() => {
      return sessionStorage.getItem('access_token') !== null;
    });
    expect.soft(hasToken, 'Token should be stored in sessionStorage').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/de-editor-login_06_authenticated.png' });
    await context.close();
  });

  test('Authenticated user can access home page @smoke @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/home`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/home_01_loaded.png' });

    expect.soft(page.url()).not.toContain('/login');
    await page.screenshot({ path: 'test-results/screenshots/home_02_verified.png' });
  });

  test('Unauthenticated user is redirected to login @regression @negative @e2e', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/home`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/unauth_01_redirect.png' });

    expect.soft(page.url(), 'Unauthenticated user should be redirected to login').toContain('/login');

    await page.screenshot({ path: 'test-results/screenshots/unauth_02_on-login.png' });
    await context.close();
  });
});

test.describe.serial('Masking E2E — Dashboard Navigation @critical @e2e', () => {
  test('Navigate to Masking Config dashboard @critical @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_01_loaded.png' });

    // Dashboard should be accessible (not redirected to login)
    expect.soft(page.url()).toContain('/masking-config');

    // Look for the "Tokenization - Dashboard" heading
    const heading = page.getByText(/tokenization/i).first();
    expect.soft(await heading.isVisible().catch(() => false), 'Dashboard heading should be visible').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_02_heading.png' });
  });

  test('Dashboard shows filter controls @critical @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_03_filters.png' });

    // Check for Status filter and Message Type filter
    const statusFilter = page.getByText(/status/i).first();
    const msgTypeFilter = page.getByText(/message type/i).first();

    expect.soft(await statusFilter.isVisible().catch(() => false), 'Status filter should exist').toBe(true);
    expect.soft(await msgTypeFilter.isVisible().catch(() => false), 'Message Type filter should exist').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_04_filter-controls.png' });
  });

  test('Editor sees "New Configuration" button @critical @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_05_new-btn.png' });

    // "New Configuration" button should be visible for data_engineer_editor
    const newBtn = page.getByRole('button', { name: /new configuration/i });
    expect.soft(await newBtn.isVisible().catch(() => false), 'New Configuration button should be visible for Editor').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/masking-dashboard_06_new-btn-check.png' });
  });
});

test.describe.serial('Masking E2E — Create Flow @critical @e2e', () => {
  test('Navigate to Create Masking Config page @critical @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config/action?mode=create`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-create_01_loaded.png' });

    expect.soft(page.url()).toContain('/masking-config/action');
    expect.soft(page.url()).toContain('mode=create');

    await page.screenshot({ path: 'test-results/screenshots/masking-create_02_url-check.png' });
  });

  test('Create page shows Dataset tab with dropdowns @critical @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config/action?mode=create`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-create_03_dataset-tab.png' });

    // Should have "Dataset" and "Configure" tabs
    const datasetTab = page.getByText(/dataset/i).first();
    const configureTab = page.getByText(/configure/i).first();

    expect.soft(await datasetTab.isVisible().catch(() => false), 'Dataset tab should be visible').toBe(true);
    expect.soft(await configureTab.isVisible().catch(() => false), 'Configure tab should be visible').toBe(true);

    // Message Type dropdown
    const msgTypeSelect = page.getByText(/message type/i).first();
    expect.soft(await msgTypeSelect.isVisible().catch(() => false), 'Message Type dropdown should exist').toBe(true);

    await page.screenshot({ path: 'test-results/screenshots/masking-create_04_tabs-check.png' });
  });
});

test.describe.serial('Masking E2E — Approver View @critical @e2e', () => {
  test('Approver sees dashboard but no "New Configuration" button @critical @e2e', async ({ browser }) => {
    const approver = getDataEngineerApprover();
    test.skip(!approver, 'Data Engineer Approver user not found');

    const tokenFile = require('fs').readFileSync(
      require('path').resolve(process.cwd(), '.auth', `${approver!.key}.token.json`),
      'utf-8',
    );
    const tokenData = JSON.parse(tokenFile);
    test.skip(!tokenData.authenticated, `Login failed for ${approver!.key}`);

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(FRONTEND_URL);
    await page.evaluate(
      ({ token }) => { sessionStorage.setItem('access_token', token); },
      { token: tokenData.token },
    );

    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: 'test-results/screenshots/masking-approver_01_dashboard.png' });

    // Approver should see dashboard
    expect.soft(page.url()).toContain('/masking-config');

    // But NOT the "New Configuration" button
    const newBtn = page.getByRole('button', { name: /new configuration/i });
    const newBtnVisible = await newBtn.isVisible().catch(() => false);
    expect.soft(newBtnVisible, 'Approver should NOT see New Configuration button').toBe(false);

    await page.screenshot({ path: 'test-results/screenshots/masking-approver_02_no-new-btn.png' });
    await context.close();
  });
});

test.describe('Masking E2E — Login Form Validation @regression @e2e', () => {
  test('Submit empty form shows validation errors @regression @negative @e2e', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/login`);
    await page.screenshot({ path: 'test-results/screenshots/validation_01_empty-form.png' });

    await page.getByRole('button', { name: /login/i }).click();
    await page.screenshot({ path: 'test-results/screenshots/validation_02_after-submit.png' });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/screenshots/validation_03_errors-shown.png' });

    const pageContent = await page.textContent('body');
    const hasValidationFeedback =
      pageContent?.toLowerCase().includes('required') ||
      pageContent?.toLowerCase().includes('email') ||
      pageContent?.toLowerCase().includes('invalid');

    expect.soft(hasValidationFeedback, 'Validation errors should appear for empty form').toBeTruthy();

    await context.close();
  });

  test('Invalid email format shows error @regression @negative @e2e', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel('Email Address').fill('not-an-email');
    await page.getByLabel('Password').fill('somepassword');
    await page.screenshot({ path: 'test-results/screenshots/validation_04_invalid-email.png' });

    await page.getByRole('button', { name: /login/i }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/screenshots/validation_05_email-error.png' });

    await context.close();
  });

  test('Wrong credentials shows error message @regression @negative @e2e', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel('Email Address').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.screenshot({ path: 'test-results/screenshots/validation_06_wrong-creds.png' });

    await page.getByRole('button', { name: /login/i }).click();

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/screenshots/validation_07_login-error.png' });

    expect.soft(page.url()).toContain('/login');

    await context.close();
  });
});

}); // end RETIRED describe.skip

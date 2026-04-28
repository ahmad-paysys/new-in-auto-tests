import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import { MaskingViewModal } from '../page-objects/masking-view-modal.page';
import {
  createEditorPage,
  createApproverPage,
  createNonDEPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

test.describe('Masking RBAC — UI Restrictions @E2E-Frontend-Only', () => {
  test('DE Editor sees New Configuration button @E2E-Frontend-Only @critical', async ({
    browser,
  }) => {
    const auth = await createEditorPage(browser);
    const dashboard = new MaskingDashboardPage(auth.page);

    await dashboard.goto();
    await dashboard.screenshot('rbac_01_editor-dashboard');

    await dashboard.expectNewConfigButtonVisible(true);
    await dashboard.screenshot('rbac_02_editor-new-btn');

    await auth.context.close();
  });

  test('DE Approver does NOT see New Configuration button @E2E-Frontend-Only @critical', async ({
    browser,
  }) => {
    const auth = await createApproverPage(browser);
    const dashboard = new MaskingDashboardPage(auth.page);

    await dashboard.goto();
    await dashboard.screenshot('rbac_03_approver-dashboard');

    await dashboard.expectNewConfigButtonVisible(false);
    await dashboard.screenshot('rbac_04_approver-no-new-btn');

    await auth.context.close();
  });

  test('Non-DE user cannot access masking dashboard @E2E-Frontend-Only @critical', async ({
    browser,
  }) => {
    const auth = await createNonDEPage(browser);

    await auth.page.goto(`${FRONTEND_URL}/masking-config`);
    await auth.page.waitForLoadState('networkidle').catch(() => {});
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_05_non-de-redirect.png',
    });

    // Non-DE (TRS) user should be redirected away from masking routes
    const url = auth.page.url();
    expect(
      url.includes('/home') || !url.includes('/masking-config'),
      'Non-DE user should be redirected away from masking dashboard',
    ).toBe(true);
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_06_non-de-on-home.png',
    });

    await auth.context.close();
  });

  test('Non-DE user cannot access create page @E2E-Frontend-Only @regression', async ({
    browser,
  }) => {
    const auth = await createNonDEPage(browser);

    await auth.page.goto(`${FRONTEND_URL}/masking-config/action?mode=create`);
    await auth.page.waitForLoadState('networkidle').catch(() => {});
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_07_non-de-create-redirect.png',
    });

    const url = auth.page.url();
    expect(
      url.includes('/home') || !url.includes('/masking-config'),
      'Non-DE user should be redirected away from create page',
    ).toBe(true);

    await auth.context.close();
  });

  test('DE Approver cannot access create page @E2E-Frontend-Only @regression', async ({
    browser,
  }) => {
    const auth = await createApproverPage(browser);

    await auth.page.goto(`${FRONTEND_URL}/masking-config/action?mode=create`);
    await auth.page.waitForLoadState('networkidle').catch(() => {});
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_08_approver-create.png',
    });

    // Approver navigating to create URL should either redirect or have non-functional form
    // The frontend may redirect approver or just show a non-editable view
    const url = auth.page.url();
    const hasNewConfigBtn = await auth.page
      .getByRole('button', { name: 'Save & Next' })
      .isVisible()
      .catch(() => false);

    // Either redirected away OR the submit button is not functional
    expect(
      !url.includes('mode=create') || !hasNewConfigBtn,
      'Approver should not be able to use the create page',
    ).toBe(true);
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_09_approver-create-blocked.png',
    });

    await auth.context.close();
  });

  test('Editor sees correct status set in filters @E2E-Frontend-Only @regression', async ({
    browser,
  }) => {
    const auth = await createEditorPage(browser);
    const dashboard = new MaskingDashboardPage(auth.page);

    await dashboard.goto();
    await dashboard.screenshot('rbac_10_editor-filters');

    // Open status filter dropdown
    await dashboard.statusFilter.click();
    await auth.page.waitForTimeout(500);
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_11_editor-status-options.png',
    });

    // Editor should see IN_PROGRESS, UNDER_REVIEW, APPROVED, REJECTED
    const pageContent = await auth.page.textContent('body');
    expect.soft(pageContent).toContain('In Progress');
    expect.soft(pageContent).toContain('Under Review');
    expect.soft(pageContent).toContain('Approved');
    expect.soft(pageContent).toContain('Rejected');

    await auth.context.close();
  });

  test('Approver sees limited status set @E2E-Frontend-Only @regression', async ({
    browser,
  }) => {
    const auth = await createApproverPage(browser);
    const dashboard = new MaskingDashboardPage(auth.page);

    await dashboard.goto();
    await dashboard.screenshot('rbac_12_approver-filters');

    // Open status filter dropdown
    await dashboard.statusFilter.click();
    await auth.page.waitForTimeout(500);
    await auth.page.screenshot({
      path: 'test-results/screenshots/e2e-fo/rbac_13_approver-status-options.png',
    });

    // Approver should see UNDER_REVIEW, APPROVED (per rbac-config)
    const pageContent = await auth.page.textContent('body');
    expect.soft(pageContent).toContain('Under Review');
    expect.soft(pageContent).toContain('Approved');

    // Should NOT see IN_PROGRESS
    // Note: soft assertion — the filter may still list it but return empty results
    expect
      .soft(pageContent?.includes('In Progress'), 'Approver should not see In Progress filter')
      .toBe(false);

    await auth.context.close();
  });
});

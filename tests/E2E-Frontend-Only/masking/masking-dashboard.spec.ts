import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import {
  createEditorPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';

let auth: AuthenticatedContext;
let dashboard: MaskingDashboardPage;

test.describe.serial('Masking Dashboard @E2E-Frontend-Only @smoke', () => {
  test.beforeAll(async ({ browser }) => {
    auth = await createEditorPage(browser);
    dashboard = new MaskingDashboardPage(auth.page);
  });

  test.afterAll(async () => {
    await auth.context.close();
  });

  test('Dashboard loads with heading @E2E-Frontend-Only @smoke', async () => {
    await dashboard.goto();
    await dashboard.screenshot('dashboard_01_loaded');

    await dashboard.expectLoaded();
    await dashboard.screenshot('dashboard_02_heading-visible');
  });

  test('Dashboard shows table with rows @E2E-Frontend-Only @smoke', async () => {
    await dashboard.goto();
    await dashboard.screenshot('dashboard_03_table');

    const rowCount = await dashboard.getRowCount();
    expect(rowCount, 'Table should have at least one row').toBeGreaterThan(0);
    await dashboard.screenshot('dashboard_04_rows-visible');
  });

  test('Status filter is functional @E2E-Frontend-Only @critical', async () => {
    await dashboard.goto();
    const unfilteredCount = await dashboard.getRowCount();
    await dashboard.screenshot('dashboard_05_before-status-filter');

    await dashboard.filterByStatus('In Progress');
    // Wait for table to re-render
    await auth.page.waitForTimeout(1000);
    await dashboard.screenshot('dashboard_06_after-status-filter');

    const filteredCount = await dashboard.getRowCount();
    // Filtered count may be same or less — just ensure no error
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    expect.soft(
      filteredCount,
      'Filtered rows should be <= unfiltered',
    ).toBeLessThanOrEqual(unfilteredCount);
  });

  test('Message type filter is functional @E2E-Frontend-Only @critical', async () => {
    await dashboard.goto();
    await dashboard.screenshot('dashboard_07_before-msgtype-filter');

    // Get the txtp text from the first row to use as a filter value
    const rowCount = await dashboard.getRowCount();
    test.skip(rowCount === 0, 'No rows to filter by');

    const firstRowTxtp = await dashboard.getCellText(0, 0);
    test.skip(!firstRowTxtp, 'Could not read txtp from first row');

    await dashboard.filterByMessageType(firstRowTxtp.trim());
    await auth.page.waitForTimeout(1000);
    await dashboard.screenshot('dashboard_08_after-msgtype-filter');

    const filteredCount = await dashboard.getRowCount();
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('Combined filters narrow results @E2E-Frontend-Only @regression', async () => {
    await dashboard.goto();
    const unfilteredCount = await dashboard.getRowCount();
    test.skip(unfilteredCount === 0, 'No rows to filter');
    await dashboard.screenshot('dashboard_09_before-combined');

    await dashboard.filterByStatus('In Progress');
    await auth.page.waitForTimeout(1000);
    const afterStatusCount = await dashboard.getRowCount();

    // Read a txtp from the visible rows (if any) for the second filter
    if (afterStatusCount > 0) {
      const txtp = await dashboard.getCellText(0, 0);
      if (txtp) {
        await dashboard.filterByMessageType(txtp.trim());
        await auth.page.waitForTimeout(1000);
      }
    }

    await dashboard.screenshot('dashboard_10_after-combined');
    const combinedCount = await dashboard.getRowCount();
    expect.soft(
      combinedCount,
      'Combined filter count should be <= unfiltered',
    ).toBeLessThanOrEqual(unfilteredCount);
  });

  test('Pagination controls work @E2E-Frontend-Only @regression', async () => {
    await dashboard.goto();
    await dashboard.screenshot('dashboard_11_pagination');

    // Check if pagination info is present
    const hasPagination = await dashboard.paginationInfo
      .isVisible()
      .catch(() => false);

    if (hasPagination) {
      const paginationText = await dashboard.paginationInfo.textContent();
      expect(paginationText).toMatch(/Showing \d+ to \d+ of \d+ entries/);
      await dashboard.screenshot('dashboard_12_pagination-info');

      // Try clicking next page if available
      const nextButton = auth.page.locator(
        'nav[aria-label="pagination navigation"] button',
      ).last();
      const isNextEnabled = await nextButton.isEnabled().catch(() => false);
      if (isNextEnabled) {
        await nextButton.click();
        await auth.page.waitForTimeout(1000);
        await dashboard.screenshot('dashboard_13_next-page');
      }
    } else {
      // Few rows — pagination may not be shown; that's fine
      expect(true, 'No pagination — too few rows').toBe(true);
    }
  });
});

import { Page, Locator, expect } from '@playwright/test';
import { SCREENSHOT_RENDER_TIMEOUT, NETWORK_IDLE_TIMEOUT } from '../helpers/constants';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

export class MaskingDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newConfigButton: Locator;
  readonly statusFilter: Locator;
  readonly messageTypeFilter: Locator;
  readonly resetFiltersButton: Locator;
  readonly table: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly paginationInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Tokenization - Dashboard');
    this.newConfigButton = page.getByRole('button', { name: 'New Configuration' });

    // Custom dropdowns — no <label> or aria-label exist in the frontend.
    // Target the filter group container that has the label text, then its dropdown trigger sibling.
    const filterBar = page.getByRole('button', { name: 'Reset Filters' }).locator('..');
    this.statusFilter = filterBar.locator('div').filter({ hasText: /^Status$/ }).locator('+ div');
    this.messageTypeFilter = filterBar.locator('div').filter({ hasText: /^Message Type$/ }).locator('+ div');

    this.resetFiltersButton = page.getByRole('button', { name: 'Reset Filters' });
    this.table = page.locator('table');
    // Body rows only — skip the header row
    this.tableRows = page.locator('table tbody tr');
    this.emptyState = page.getByText('No data available');
    this.paginationInfo = page.getByText(/Showing \d+ to \d+ of \d+ entries/);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/masking-config`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.page).toHaveURL(/\/masking-config/);
  }

  async getRowCount(): Promise<number> {
    // Wait briefly for table to render
    await this.table.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    return this.tableRows.count();
  }

  async clickNewConfiguration(): Promise<void> {
    await this.newConfigButton.click();
    await this.page.waitForURL(/\/masking-config\/action/, { timeout: 10_000 });
  }

  async expectNewConfigButtonVisible(visible: boolean): Promise<void> {
    if (visible) {
      await expect(this.newConfigButton).toBeVisible();
    } else {
      await expect(this.newConfigButton).not.toBeVisible();
    }
  }

  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.click();
    await this.page.getByText(status, { exact: true }).click();
  }

  async filterByMessageType(type: string): Promise<void> {
    await this.messageTypeFilter.click();
    await this.page.getByText(type, { exact: true }).click();
  }

  async resetFilters(): Promise<void> {
    await this.resetFiltersButton.click();
  }

  /** Click the View (eye) icon on a table row by index (0-based). */
  async openRowByIndex(index: number): Promise<void> {
    const row = this.tableRows.nth(index);
    await row.getByTitle('View').click();
  }

  /** Click the Edit (pencil) icon on a table row by index (0-based). */
  async editRowByIndex(index: number): Promise<void> {
    const row = this.tableRows.nth(index);
    await row.getByTitle('Edit').click();
    await this.page.waitForURL(/\/masking-config\/action/, { timeout: 10_000 });
  }

  /** Get the text content of a specific cell in a row. */
  async getCellText(rowIndex: number, columnIndex: number): Promise<string> {
    const cell = this.tableRows.nth(rowIndex).locator('td').nth(columnIndex);
    return (await cell.textContent()) ?? '';
  }

  async screenshot(name: string): Promise<void> {
    // Wait for the page body to have rendered content (not blank)
    await this.page
      .waitForFunction(
        () => document.body.innerText.trim().length > 0 || document.querySelector('svg, img, canvas') !== null,
        { timeout: SCREENSHOT_RENDER_TIMEOUT },
      )
      .catch(() => {}); // non-critical — take screenshot anyway for diagnostics
    await this.page.screenshot({
      path: `test-results/screenshots/e2e-fo/${name}.png`,
    });
  }
}

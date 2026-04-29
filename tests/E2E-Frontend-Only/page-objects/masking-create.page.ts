import { Page, Locator, expect } from '@playwright/test';
import { SCREENSHOT_RENDER_TIMEOUT, NETWORK_IDLE_TIMEOUT } from '../helpers/constants';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

export class MaskingCreatePage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly datasetTab: Locator;
  readonly configureTab: Locator;
  readonly overviewHeading: Locator;
  readonly selectDatasetHeading: Locator;
  readonly messageTypeDropdown: Locator;
  readonly versionDropdown: Locator;
  readonly saveAndNextButton: Locator;
  readonly nextButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByText('Tokenization').first();
    this.datasetTab = page.getByText('Dataset', { exact: true });
    this.configureTab = page.getByText('Configure', { exact: true });
    this.overviewHeading = page.getByText('Tokenization Overview');
    this.selectDatasetHeading = page.getByText('Select Dataset');
    this.messageTypeDropdown = page.getByLabel('Message Type');
    this.versionDropdown = page.getByLabel('Message Type Versions');
    this.saveAndNextButton = page.getByRole('button', { name: 'Save & Next' });
    this.nextButton = page.getByRole('button', { name: 'Next' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/masking-config/action?mode=create`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT });
  }

  async gotoEdit(id: number): Promise<void> {
    await this.page.goto(
      `${FRONTEND_URL}/masking-config/action?id=${id}&mode=edit`,
      { waitUntil: 'domcontentloaded' },
    );
    await this.page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT });
  }

  async expectDatasetTabActive(): Promise<void> {
    await expect(this.overviewHeading).toBeVisible();
    await expect(this.selectDatasetHeading).toBeVisible();
  }

  async selectTransactionType(txtp: string): Promise<void> {
    await this.messageTypeDropdown.click();
    await this.page.getByText(txtp, { exact: true }).click();
  }

  async selectVersion(version: string): Promise<void> {
    await this.versionDropdown.click();
    await this.page.getByText(version, { exact: true }).click();
  }

  /** Wait for the version dropdown to be populated (not showing loading text). */
  async waitForVersionsLoaded(): Promise<void> {
    await expect(
      this.page.getByText('Loading versions...'),
    ).not.toBeVisible({ timeout: 10_000 });
  }

  /** Click "Save & Next" (create mode) or "Next" (edit mode). */
  async goToConfigureTab(): Promise<void> {
    const saveBtn = this.saveAndNextButton;
    const nextBtn = this.nextButton;

    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    } else {
      await nextBtn.click();
    }
  }

  async expectValidationError(message: string): Promise<void> {
    await this.page.getByText(message).first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
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

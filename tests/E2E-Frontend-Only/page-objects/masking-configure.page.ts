import { Page, Locator, expect } from '@playwright/test';

export class MaskingConfigurePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subheading: Locator;
  readonly payloadHeading: Locator;
  readonly fieldNameColumn: Locator;
  readonly tokenizeColumn: Locator;
  readonly fieldRows: Locator;
  readonly totalFieldsInfo: Locator;
  readonly fieldsSelectedInfo: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Configure & Preview');
    this.subheading = page.getByText('View sample payload and configure');
    this.payloadHeading = page.getByText('Transaction Payload');
    this.fieldNameColumn = page.getByText('Field Name');
    this.tokenizeColumn = page.getByText('Tokenize');
    // Rows in the configure table body
    this.fieldRows = page.locator('table tbody tr');
    this.totalFieldsInfo = page.getByText(/Total Fields: \d+/);
    this.fieldsSelectedInfo = page.getByText(/Fields Selected for Tokenization: \d+/);
    this.backButton = page.getByRole('button', { name: 'Back' });
    this.submitButton = page.getByRole('button', { name: 'Submit' });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.payloadHeading).toBeVisible();
  }

  async getFieldCount(): Promise<number> {
    await this.fieldRows.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    return this.fieldRows.count();
  }

  /** Toggle the tokenize switch on a field row by index (0-based). */
  async toggleField(index: number): Promise<void> {
    const row = this.fieldRows.nth(index);
    // The Tokenize column renders a switch/toggle
    await row.locator('input[type="checkbox"]').click();
  }

  async goBack(): Promise<void> {
    await this.backButton.click();
  }

  /** Click Submit, which opens the confirmation modal. */
  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Confirm submission in the modal — clicks "Send For Approval". */
  async confirmSubmit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Send For Approval' }).click();
  }

  /** Cancel submission in the modal. */
  async cancelSubmit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Cancel' }).click();
  }

  /** Expect the submit confirmation modal to be visible. */
  async expectSubmitModal(): Promise<void> {
    await expect(
      this.page.getByText('Tokenization Review'),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      this.page.getByRole('button', { name: 'Send For Approval' }),
    ).toBeVisible();
  }

  /** Expect success toast after submission. */
  async expectSuccessToast(): Promise<void> {
    await expect(
      this.page.getByText(/success|created/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  /** Expect error toast with a specific message fragment. */
  async expectErrorToast(fragment: string): Promise<void> {
    await expect(
      this.page.getByText(new RegExp(fragment, 'i')).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/e2e-fo/${name}.png`,
    });
  }
}

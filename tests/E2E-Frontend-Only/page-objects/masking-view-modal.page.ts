import { Page, Locator, expect } from '@playwright/test';

export class MaskingViewModal {
  readonly page: Page;
  readonly modalTitle: Locator;
  readonly configDetailsHeading: Locator;
  readonly errorState: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly tokenizedFieldsHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modalTitle = page.getByText(/Tokenization Configuration/);
    this.configDetailsHeading = page.getByText('Configuration Details');
    this.errorState = page.getByText('Failed to load tokenization configuration.');
    this.approveButton = page.getByRole('button', { name: 'Approve' });
    this.rejectButton = page.getByRole('button', { name: 'Reject' });
    this.tokenizedFieldsHeading = page.getByText('TOKENIZED FIELDS');
  }

  async expectVisible(): Promise<void> {
    await expect(this.modalTitle).toBeVisible({ timeout: 10_000 });
    await expect(this.configDetailsHeading).toBeVisible();
  }

  /** Check whether Approve/Reject buttons are visible (approver-only). */
  async expectApproveButtonVisible(visible: boolean): Promise<void> {
    if (visible) {
      await expect(this.approveButton).toBeVisible();
      await expect(this.rejectButton).toBeVisible();
    } else {
      await expect(this.approveButton).not.toBeVisible();
      await expect(this.rejectButton).not.toBeVisible();
    }
  }

  /** Get the displayed status text from the modal. */
  async getDisplayedStatus(): Promise<string> {
    const statusRow = this.page.getByText('STATUS').first();
    const parent = statusRow.locator('..');
    return (await parent.textContent()) ?? '';
  }

  /** Get the displayed message type (txtp). */
  async getDisplayedMessageType(): Promise<string> {
    const label = this.page.getByText('MESSAGE TYPE');
    const parent = label.locator('..');
    return (await parent.textContent())?.replace('MESSAGE TYPE', '').trim() ?? '';
  }

  /** Approve the config — clicks Approve, fills optional comment, confirms. */
  async approve(comment?: string): Promise<void> {
    await this.approveButton.click();
    // Confirmation dialog appears
    await expect(
      this.page.getByText('Approve Configuration'),
    ).toBeVisible({ timeout: 5_000 });

    if (comment) {
      await this.page.getByLabel('Comment (optional)').fill(comment);
    }

    await this.page.getByRole('button', { name: 'Yes, Approve' }).click();
  }

  /** Reject the config — clicks Reject, fills required comment, confirms. */
  async reject(comment: string): Promise<void> {
    await this.rejectButton.click();
    // Confirmation dialog appears
    await expect(
      this.page.getByText('Reject Configuration'),
    ).toBeVisible({ timeout: 5_000 });

    await this.page.getByLabel('Comment (required)').fill(comment);
    await this.page.getByRole('button', { name: 'Yes, Reject' }).click();
  }

  /** Close the modal. */
  async close(): Promise<void> {
    // Press Escape to close the modal overlay
    await this.page.keyboard.press('Escape');
  }

  /** Expect approval success toast. */
  async expectApproveSuccess(): Promise<void> {
    await expect(
      this.page.getByText('Configuration approved successfully.'),
    ).toBeVisible({ timeout: 10_000 });
  }

  /** Expect rejection success toast. */
  async expectRejectSuccess(): Promise<void> {
    await expect(
      this.page.getByText('Configuration rejected.'),
    ).toBeVisible({ timeout: 10_000 });
  }

  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/e2e-fo/${name}.png`,
    });
  }
}

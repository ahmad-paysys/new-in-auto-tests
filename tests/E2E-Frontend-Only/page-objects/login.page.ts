import { Page, Locator } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email Address');
    this.passwordInput = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'LOGIN' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/login`);
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectValidationErrors(): Promise<void> {
    // Inline validation messages from react-hook-form
    await this.page.getByText('Email Address is required').or(
      this.page.getByText('This Field is Required'),
    ).first().waitFor({ state: 'visible', timeout: 5_000 });
  }

  async expectLoginError(): Promise<void> {
    await this.page.getByText(/invalid|error|failed/i).first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
  }

  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/e2e-fo/${name}.png`,
    });
  }
}

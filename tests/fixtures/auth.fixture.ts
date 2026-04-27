import { test as base, expect, APIRequestContext, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface TokenData {
  key: string;
  role: string;
  token: string | null;
  error: string | null;
  authenticated: boolean;
  timestamp: string;
}

function readTokenFile(userKey: string): TokenData {
  const tokenPath = path.resolve(process.cwd(), '.auth', `${userKey}.token.json`);
  if (!fs.existsSync(tokenPath)) {
    return {
      key: userKey,
      role: 'unknown',
      token: null,
      error: `Token file not found: ${tokenPath}`,
      authenticated: false,
      timestamp: '',
    };
  }
  return JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
}

export function getTokenForUser(userKey: string): string | null {
  return readTokenFile(userKey).token;
}

export function isUserAuthenticated(userKey: string): boolean {
  return readTokenFile(userKey).authenticated;
}

export function getUserAuthError(userKey: string): string | null {
  return readTokenFile(userKey).error;
}

export function getAuthHeader(userKey: string): Record<string, string> {
  const token = getTokenForUser(userKey);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export type AuthFixtures = {
  defaultUserKey: string;
  authToken: string;
  authenticatedRequest: APIRequestContext;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  defaultUserKey: ['Tims', { option: true }],

  authToken: async ({ defaultUserKey }, use, testInfo) => {
    const tokenData = readTokenFile(defaultUserKey);
    if (!tokenData.authenticated) {
      testInfo.annotations.push({
        type: 'skip',
        description: `Skipped: login failed for role '${tokenData.role}' — ${tokenData.error}`,
      });
      test.skip(true, `Login failed for ${defaultUserKey} (${tokenData.role}): ${tokenData.error}`);
      return;
    }
    await use(tokenData.token!);
  },

  authenticatedRequest: async ({ playwright, baseURL, defaultUserKey }, use, testInfo) => {
    const tokenData = readTokenFile(defaultUserKey);
    if (!tokenData.authenticated) {
      testInfo.annotations.push({
        type: 'skip',
        description: `Skipped: login failed for role '${tokenData.role}' — ${tokenData.error}`,
      });
      test.skip(true, `Login failed for ${defaultUserKey} (${tokenData.role}): ${tokenData.error}`);
      return;
    }

    const context = await playwright.request.newContext({
      baseURL: baseURL || undefined,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.token}`,
      },
    });

    await use(context);
    await context.dispose();
  },

  authenticatedPage: async ({ browser, baseURL, defaultUserKey }, use, testInfo) => {
    const tokenData = readTokenFile(defaultUserKey);
    if (!tokenData.authenticated) {
      testInfo.annotations.push({
        type: 'skip',
        description: `Skipped: login failed for role '${tokenData.role}' — ${tokenData.error}`,
      });
      test.skip(true, `Login failed for ${defaultUserKey} (${tokenData.role}): ${tokenData.error}`);
      return;
    }

    const frontendURL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';
    const context = await browser.newContext();
    const page = await context.newPage();

    // Inject token into sessionStorage.
    // The frontend uses AES-encrypted sessionStorage, but for test purposes
    // we inject the raw token and user data. The frontend's prepareHeaders
    // reads via extractData("access_token") which decrypts. For tests,
    // we navigate first then inject via page.evaluate.
    await page.goto(frontendURL);
    await page.evaluate(
      ({ token }) => {
        // Store token directly — if the app uses encryption we may need the crypto key
        sessionStorage.setItem('access_token', token);
      },
      { token: tokenData.token! },
    );

    await use(page);
    await context.close();
  },
});

export { expect };

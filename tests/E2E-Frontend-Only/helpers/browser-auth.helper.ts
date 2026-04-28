import { Browser, BrowserContext, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TokenData } from '../../fixtures/auth.fixture';
import {
  getDataEngineerEditor,
  getDataEngineerApprover,
  getNonDataEngineerUsers,
  TestUser,
} from '../../helpers/users-loader';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

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

/**
 * Login via the UI — fills the form and clicks login.
 * Waits for redirect away from /login.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  });
}

/**
 * Inject a pre-fetched JWT into sessionStorage.
 * Navigates to the frontend first (sessionStorage is origin-scoped),
 * then sets the token.
 */
export async function injectToken(page: Page, userKey: string): Promise<void> {
  const tokenData = readTokenFile(userKey);
  if (!tokenData.authenticated || !tokenData.token) {
    throw new Error(
      `Cannot inject token for ${userKey}: ${tokenData.error ?? 'not authenticated'}`,
    );
  }

  await page.goto(FRONTEND_URL);
  await page.evaluate(
    ({ token }) => {
      sessionStorage.setItem('access_token', token);
    },
    { token: tokenData.token },
  );
}

export interface AuthenticatedContext {
  context: BrowserContext;
  page: Page;
  user: TestUser;
}

/**
 * Creates a new browser context + page with a token injected for the given user key.
 * Caller is responsible for closing the context when done.
 */
export async function createAuthenticatedContext(
  browser: Browser,
  userKey: string,
): Promise<AuthenticatedContext> {
  const tokenData = readTokenFile(userKey);
  if (!tokenData.authenticated || !tokenData.token) {
    throw new Error(
      `Cannot create context for ${userKey}: ${tokenData.error ?? 'not authenticated'}`,
    );
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(FRONTEND_URL);
  await page.evaluate(
    ({ token }) => {
      sessionStorage.setItem('access_token', token);
    },
    { token: tokenData.token },
  );

  // Import dynamically to avoid circular — we just need the user object
  const { getUserByKey } = await import('../../helpers/users-loader');
  const user = getUserByKey(userKey)!;

  return { context, page, user };
}

/** Shorthand: authenticated context for the Data Engineer Editor. */
export async function createEditorPage(
  browser: Browser,
): Promise<AuthenticatedContext> {
  const user = getDataEngineerEditor();
  if (!user) throw new Error('Data Engineer Editor user not found in docs-users.json');
  return createAuthenticatedContext(browser, user.key);
}

/** Shorthand: authenticated context for the Data Engineer Approver. */
export async function createApproverPage(
  browser: Browser,
): Promise<AuthenticatedContext> {
  const user = getDataEngineerApprover();
  if (!user) throw new Error('Data Engineer Approver user not found in docs-users.json');
  return createAuthenticatedContext(browser, user.key);
}

/** Shorthand: authenticated context for a non-DE (TRS) user. */
export async function createNonDEPage(
  browser: Browser,
): Promise<AuthenticatedContext> {
  const users = getNonDataEngineerUsers();
  if (users.length === 0) throw new Error('No non-DE users found in docs-users.json');
  return createAuthenticatedContext(browser, users[0].key);
}

/** Check whether a user's token file exists and is authenticated. */
export function isAuthenticated(userKey: string): boolean {
  return readTokenFile(userKey).authenticated;
}

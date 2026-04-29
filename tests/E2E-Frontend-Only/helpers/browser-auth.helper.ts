import { Browser, BrowserContext, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import CryptoJS from 'crypto-js';
import { TokenData } from '../../fixtures/auth.fixture';
import {
  getDataEngineerEditor,
  getDataEngineerApprover,
  getNonDataEngineerUsers,
  TestUser,
} from '../../helpers/users-loader';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';
const CRYPTO_KEY = process.env.VITE_CRYPTO_KEY || '';

if (!CRYPTO_KEY) {
  console.warn(
    '[browser-auth] VITE_CRYPTO_KEY not set — token injection will fail. ' +
    'Set it in .env to match the deployed frontend.',
  );
}

/**
 * Encrypt data the same way the frontend does:
 * CryptoJS.AES.encrypt(JSON.stringify(data), VITE_CRYPTO_KEY).toString()
 */
function encryptForFrontend(data: unknown): string {
  return CryptoJS.AES.encrypt(JSON.stringify(data), CRYPTO_KEY).toString();
}

/**
 * Decode a JWT payload (base64url → JSON). No signature verification.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Build the `user` object matching the frontend's `decodeToken()` output.
 * The frontend stores: { id, username, email, claims }
 * where `claims` is the first entry in the claims array starting with `trs_`, with prefix stripped.
 */
function buildUserObject(token: string): Record<string, unknown> | null {
  const outerPayload = decodeJwtPayload(token);
  if (!outerPayload) return null;

  // Frontend supports nested tokens (outerPayload.tokenString)
  const innerPayload =
    typeof outerPayload.tokenString === 'string'
      ? decodeJwtPayload(outerPayload.tokenString as string) ?? outerPayload
      : outerPayload;

  const claimsRaw: string[] =
    (outerPayload.claims as string[]) ??
    ((innerPayload.realm_access as Record<string, unknown>)?.roles as string[]) ??
    [];

  const trsClaim = claimsRaw
    .find((c: string) => c.startsWith('trs_'))
    ?.replace(/^trs_/, '');

  return {
    id:
      (innerPayload.sub as string) ??
      (outerPayload.sub as string) ??
      (outerPayload.clientId as string) ??
      'unknown',
    username:
      (innerPayload.preferred_username as string) ??
      (innerPayload.username as string) ??
      (outerPayload.preferred_username as string) ??
      (outerPayload.username as string) ??
      (innerPayload.sub as string) ??
      (outerPayload.sub as string) ??
      'user',
    email:
      (innerPayload.email as string) ?? (outerPayload.email as string),
    claims: trsClaim,
  };
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
 * Inject a pre-fetched JWT into sessionStorage (AES-encrypted, matching frontend).
 * Navigates to the frontend first (sessionStorage is origin-scoped),
 * sets both `access_token` and `user` (encrypted), then reloads.
 */
export async function injectToken(page: Page, userKey: string): Promise<void> {
  const tokenData = readTokenFile(userKey);
  if (!tokenData.authenticated || !tokenData.token) {
    throw new Error(
      `Cannot inject token for ${userKey}: ${tokenData.error ?? 'not authenticated'}`,
    );
  }

  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });

  const encryptedToken = encryptForFrontend(tokenData.token);
  const userObj = buildUserObject(tokenData.token);
  const encryptedUser = userObj ? encryptForFrontend(userObj) : null;

  await page.evaluate(
    ({ token, user }) => {
      sessionStorage.setItem('access_token', token);
      if (user) sessionStorage.setItem('user', user);
    },
    { token: encryptedToken, user: encryptedUser },
  );

  // Reload so the SPA reads the encrypted values from sessionStorage
  await page.reload({ waitUntil: 'networkidle' });
}

export interface AuthenticatedContext {
  context: BrowserContext;
  page: Page;
  user: TestUser;
}

/**
 * Creates a new browser context + page with a token injected for the given user key.
 * Token and user object are AES-encrypted to match the frontend's storage format.
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

  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });

  const encryptedToken = encryptForFrontend(tokenData.token);
  const userObj = buildUserObject(tokenData.token);
  const encryptedUser = userObj ? encryptForFrontend(userObj) : null;

  await page.evaluate(
    ({ token, user }) => {
      sessionStorage.setItem('access_token', token);
      if (user) sessionStorage.setItem('user', user);
    },
    { token: encryptedToken, user: encryptedUser },
  );

  // Reload so the SPA reads the encrypted values and renders authenticated state
  await page.reload({ waitUntil: 'networkidle' });

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

import { test, expect } from '../fixtures/auth.fixture';
import { ApiClient } from '../fixtures/api-client.fixture';
import {
  getAllUsers,
  getDataEngineerUsers,
  getDataEngineerApprover,
  getDataEngineerEditor,
  getNonDataEngineerUsers,
} from '../helpers/users-loader';
import { getMaskingEndpoints } from '../helpers/swagger-parser';
import { getAllowedStatuses } from '../helpers/rbac-loader';

/**
 * RBAC permission tests for /masking/* endpoints.
 *
 * - Data Engineer roles (Tims, Kashif) MUST have access → expect success
 * - Non-Data-Engineer roles (Ali, Behjet) MUST NOT have access → expect 401 (guard rejects missing claims)
 * - Unauthenticated → expect 401
 *
 * Tags: @rbac
 * ALL assertions use expect.soft()
 */

const endpoints = getMaskingEndpoints();
const deUsers = getDataEngineerUsers();
const nonDEUsers = getNonDataEngineerUsers();

// ─── API RBAC: Authorized users (Data Engineer) ─────────

test.describe('Masking RBAC — Data Engineer users have access @rbac @api', () => {
  for (const user of deUsers) {
    test.describe(`${user.key} (${user.role})`, () => {
      let client: ApiClient;

      test.beforeAll(async () => {
        client = new ApiClient({
          userKey: user.key,
          testName: `rbac-de-${user.key}`,
        });
      });

      test.afterAll(async () => {
        await client.dispose();
      });

      test(`POST /masking/api/all — ${user.role} can list masking configs @rbac @smoke`, async () => {
        const res = await client.post('/masking/api/all', {}, { offset: 0, limit: 10 });
        expect.soft(res.status, `${user.role} should access list endpoint`).not.toBe(403);
        expect.soft(res.status, `${user.role} should not get 401`).not.toBe(401);
      });

      test(`GET /masking/api/1 — ${user.role} can get masking by ID @rbac`, async () => {
        const res = await client.get('/masking/api/1');
        // May be 404 if no resource exists, but should NOT be 403 or 401
        expect.soft(res.status, `${user.role} should not get 403`).not.toBe(403);
        expect.soft(res.status, `${user.role} should not get 401`).not.toBe(401);
      });
    });
  }
});

// ─── API RBAC: Tier2 status filtering ───────────────────

test.describe('Masking RBAC — Tier2 status filtering on list @rbac @api', () => {
  test('Editor sees IN_PROGRESS configs in list @rbac', async () => {
    const editor = getDataEngineerEditor();
    test.skip(!editor, 'Editor user not found');

    const client = new ApiClient({ userKey: editor!.key, testName: 'rbac-tier2-editor-list' });
    const res = await client.post(
      '/masking/api/all',
      { status: 'STATUS_01_IN_PROGRESS' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Editor should get 201 for list').toBe(201);
    // Verify editor is allowed to see IN_PROGRESS per rbac-config
    const allowedStatuses = getAllowedStatuses(editor!.role, 'POST', '/masking/api/all');
    expect.soft(allowedStatuses, 'Editor should have IN_PROGRESS in allowed statuses').toContain('STATUS_01_IN_PROGRESS');
    await client.dispose();
  });

  test('Approver does NOT see IN_PROGRESS configs in list @rbac', async () => {
    const approver = getDataEngineerApprover();
    test.skip(!approver, 'Approver user not found');

    const client = new ApiClient({ userKey: approver!.key, testName: 'rbac-tier2-approver-list' });
    // Approver requests IN_PROGRESS — backend should filter these out
    const res = await client.post(
      '/masking/api/all',
      { status: 'STATUS_01_IN_PROGRESS' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Approver should get 201 for list').toBe(201);
    // Verify approver is NOT allowed IN_PROGRESS per rbac-config
    const allowedStatuses = getAllowedStatuses(approver!.role, 'POST', '/masking/api/all');
    expect.soft(allowedStatuses, 'Approver should NOT have IN_PROGRESS in allowed statuses').not.toContain('STATUS_01_IN_PROGRESS');

    // If response has masks, none should be IN_PROGRESS
    if (res.body?.masks && Array.isArray(res.body.masks)) {
      for (const mask of res.body.masks) {
        expect.soft(mask.status, 'Approver should not see IN_PROGRESS masks').not.toBe('STATUS_01_IN_PROGRESS');
      }
    }
    await client.dispose();
  });

  test('Approver sees UNDER_REVIEW configs in list @rbac', async () => {
    const approver = getDataEngineerApprover();
    test.skip(!approver, 'Approver user not found');

    const client = new ApiClient({ userKey: approver!.key, testName: 'rbac-tier2-approver-review-list' });
    const res = await client.post(
      '/masking/api/all',
      { status: 'STATUS_03_UNDER_REVIEW' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Approver should get 201 for list').toBe(201);
    const allowedStatuses = getAllowedStatuses(approver!.role, 'POST', '/masking/api/all');
    expect.soft(allowedStatuses, 'Approver should have UNDER_REVIEW in allowed statuses').toContain('STATUS_03_UNDER_REVIEW');
    await client.dispose();
  });
});

// ─── API RBAC: Unauthorized users (non-Data Engineer) ───

test.describe('Masking RBAC — Non-Data-Engineer users denied @rbac @negative @api', () => {
  for (const user of nonDEUsers) {
    test.describe(`${user.key} (${user.role})`, () => {
      let client: ApiClient;

      test.beforeAll(async () => {
        client = new ApiClient({
          userKey: user.key,
          testName: `rbac-non-de-${user.key}`,
        });
      });

      test.afterAll(async () => {
        await client.dispose();
      });

      test(`POST /masking/api/all — ${user.role} denied @rbac @negative`, async () => {
        const res = await client.post('/masking/api/all', {}, { offset: 0, limit: 10 });
        expect.soft(res.status, `${user.role} should get 401 on list (missing claims)`).toBe(401);
      });

      test(`POST /masking/api/create — ${user.role} denied @rbac @negative`, async () => {
        const res = await client.post('/masking/api/create', {
          txtp: 'rbac.test.denied',
        });
        expect.soft(res.status, `${user.role} should get 401 on create (missing claims)`).toBe(401);
      });

      test(`GET /masking/api/1 — ${user.role} denied @rbac @negative`, async () => {
        const res = await client.get('/masking/api/1');
        expect.soft(res.status, `${user.role} should get 401 on get (missing claims)`).toBe(401);
      });

      test(`PUT /masking/api/1 — ${user.role} denied @rbac @negative`, async () => {
        const res = await client.put('/masking/api/1', { comments: 'rbac test' });
        expect.soft(res.status, `${user.role} should get 401 on update (missing claims)`).toBe(401);
      });

      test(`PATCH /masking/api/1/review — ${user.role} denied @rbac @negative`, async () => {
        const res = await client.patch('/masking/api/1/review', { action: 'approve' });
        expect.soft(res.status, `${user.role} should get 401 on review (missing claims)`).toBe(401);
      });
    });
  }
});

// ─── API RBAC: Unauthenticated ──────────────────────────

test.describe('Masking RBAC — Unauthenticated requests @rbac @negative @api', () => {
  test('POST /masking/api/all — no token returns 401 @rbac @negative', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });
    const res = await ctx.post('/masking/api/all?offset=0&limit=10', { data: {} });
    expect.soft(res.status(), 'No token should return 401').toBe(401);
    await ctx.dispose();
  });

  test('POST /masking/api/create — no token returns 401 @rbac @negative', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });
    const res = await ctx.post('/masking/api/create', { data: { txtp: 'unauth.test' } });
    expect.soft(res.status(), 'No token should return 401').toBe(401);
    await ctx.dispose();
  });

  test('GET /masking/api/1 — no token returns 401 @rbac @negative', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });
    const res = await ctx.get('/masking/api/1');
    expect.soft(res.status(), 'No token should return 401').toBe(401);
    await ctx.dispose();
  });

  test('PUT /masking/api/1 — no token returns 401 @rbac @negative', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });
    const res = await ctx.put('/masking/api/1', { data: { comments: 'unauth test' } });
    expect.soft(res.status(), 'No token should return 401').toBe(401);
    await ctx.dispose();
  });

  test('PATCH /masking/api/1/review — no token returns 401 @rbac @negative', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });
    const res = await ctx.patch('/masking/api/1/review', { data: { action: 'approve' } });
    expect.soft(res.status(), 'No token should return 401').toBe(401);
    await ctx.dispose();
  });
});

// ─── FRONTEND RBAC ──────────────────────────────────────

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://10.10.80.37:5174';

test.describe('Masking RBAC — Frontend access control @rbac @e2e', () => {
  for (const user of nonDEUsers) {
    test(`${user.key} (${user.role}) is denied access to /masking-config @rbac @e2e`, async ({ browser }) => {
      const tokenFile = require('fs').readFileSync(
        require('path').resolve(process.cwd(), '.auth', `${user.key}.token.json`),
        'utf-8',
      );
      const tokenData = JSON.parse(tokenFile);

      test.skip(!tokenData.authenticated, `Login failed for ${user.key}`);

      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(FRONTEND_URL);
      await page.evaluate(
        ({ token }) => {
          sessionStorage.setItem('access_token', token);
        },
        { token: tokenData.token },
      );

      // Navigate directly to masking-config route
      await page.goto(`${FRONTEND_URL}/masking-config`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.screenshot({
        path: `test-results/screenshots/rbac-frontend_${user.key}_01_masking-config.png`,
      });

      // Non-DE user should be redirected or see access denied
      const url = page.url();
      const isOnMaskingConfig = url.includes('/masking-config');

      expect.soft(
        isOnMaskingConfig,
        `${user.role} should NOT remain on /masking-config`,
      ).toBe(false);

      await page.screenshot({
        path: `test-results/screenshots/rbac-frontend_${user.key}_02_denied.png`,
      });
      await context.close();
    });
  }

  test('Data Engineer Editor can access /masking-config @rbac @e2e', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({
      path: 'test-results/screenshots/rbac-frontend_de-editor_01_masking-config.png',
    });

    // Editor should see dashboard
    expect.soft(page.url()).toContain('/masking-config');

    // Editor should see "New Configuration" button
    const newBtn = page.getByRole('button', { name: /new configuration/i });
    expect.soft(
      await newBtn.isVisible().catch(() => false),
      'Data Engineer Editor should see New Configuration button',
    ).toBe(true);

    await page.screenshot({
      path: 'test-results/screenshots/rbac-frontend_de-editor_02_new-btn.png',
    });
  });

  test('Data Engineer Approver can access /masking-config but cannot create @rbac @e2e', async ({ browser }) => {
    const approver = getDataEngineerApprover();
    test.skip(!approver, 'Data Engineer Approver user not found');

    const tokenFile = require('fs').readFileSync(
      require('path').resolve(process.cwd(), '.auth', `${approver!.key}.token.json`),
      'utf-8',
    );
    const tokenData = JSON.parse(tokenFile);
    test.skip(!tokenData.authenticated, `Login failed for ${approver!.key}`);

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(FRONTEND_URL);
    await page.evaluate(
      ({ token }) => { sessionStorage.setItem('access_token', token); },
      { token: tokenData.token },
    );

    await page.goto(`${FRONTEND_URL}/masking-config`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({
      path: 'test-results/screenshots/rbac-frontend_de-approver_01_masking-config.png',
    });

    // Approver should see dashboard
    expect.soft(page.url()).toContain('/masking-config');

    // Approver should NOT see "New Configuration" button
    const newBtn = page.getByRole('button', { name: /new configuration/i });
    expect.soft(
      await newBtn.isVisible().catch(() => false),
      'Data Engineer Approver should NOT see New Configuration button',
    ).toBe(false);

    await page.screenshot({
      path: 'test-results/screenshots/rbac-frontend_de-approver_02_no-create.png',
    });
    await context.close();
  });
});

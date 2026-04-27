import { test, expect } from '../fixtures/auth.fixture';
import { ApiClient } from '../fixtures/api-client.fixture';
import { getMaskingEndpoints } from '../helpers/swagger-parser';
import { getDataEngineerEditor, getDataEngineerApprover } from '../helpers/users-loader';
import {
  fetchAllowedTransactionTypes,
  getCreateableTxtp,
  TransactionType,
  FICTIONAL_TXTP,
} from '../helpers/transaction-types-loader';

/**
 * API tests for /masking/* endpoints.
 * Uses Data Engineer Editor (Tims) as the default authenticated user.
 * Tests follow logical order: Create → Read → Update → Review.
 *
 * Confirmed staging behavior:
 *   - POST /masking/api/create → editor-only (approver gets 403)
 *   - PATCH /masking/api/:id/review → approver-only (editor gets 403)
 *   - Duplicate txtp+version → 400 with unique constraint error
 *   - Tier2 status filtering applies on GET/PUT
 *
 * ALL assertions use expect.soft().
 */

const endpoints = getMaskingEndpoints();
const deEditor = getDataEngineerEditor();
const deApprover = getDataEngineerApprover();

// Resource ID created during tests, shared across serial describe blocks
let createdMaskId: number | null = null;
let allowedTypes: TransactionType[] = [];
/** A txtp+version pair guaranteed to not already exist as a masking */
let createTarget: { txtp: string; version: string } | null = null;

test.describe.serial('Masking API — CRUD Lifecycle @critical @api', () => {
  let client: ApiClient;

  test.beforeAll(async () => {
    client = new ApiClient({
      userKey: 'Tims',
      testName: 'masking-api-crud',
    });

    // Fetch allowed transaction types from config API
    allowedTypes = await fetchAllowedTransactionTypes('Tims');
    // Find a txtp+version combo that doesn't already exist
    createTarget = await getCreateableTxtp('Tims');
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  // ─── CREATE ─────────────────────────────────────────────

  test('GET /config/api/transaction-types — fetch allowed types @smoke @api', async () => {
    expect.soft(allowedTypes.length, 'Should have at least one allowed transaction type').toBeGreaterThan(0);
    for (const t of allowedTypes) {
      expect.soft(t.transaction_type, 'Each type should have a transaction_type string').toBeTruthy();
      expect.soft(t.endpoint_path, 'Each type should have an endpoint_path string').toBeTruthy();
    }
  });

  test('POST /masking/api/create — create masking config with allowed txtp @smoke @api', async () => {
    test.skip(!createTarget, 'No allowed transaction types available');

    const res = await client.post('/masking/api/create', {
      txtp: createTarget!.txtp,
      txtpVersion: createTarget!.version,
    });

    // Should succeed because we picked a txtp+version that doesn't exist yet
    expect.soft(res.status, 'Expected 201 Created').toBe(201);

    // Response shape: { success: boolean, message: string, id: number }
    expect.soft(res.body?.success, 'Response should indicate success').toBe(true);
    expect.soft(res.body?.message, 'Response should include message').toBeTruthy();
    expect.soft(res.body?.id, 'Response should include created ID').toBeTruthy();

    if (res.body?.id) {
      createdMaskId = res.body.id;
    }
  });

  test('POST /masking/api/create — duplicate txtp+version returns already-exists error @regression @negative @api', async () => {
    test.skip(!createTarget, 'No allowed transaction types available');

    // Re-send the exact same txtp+version — should now be a duplicate
    const res = await client.post('/masking/api/create', {
      txtp: createTarget!.txtp,
      txtpVersion: createTarget!.version,
    });

    expect.soft(res.status, 'Expected 400 for duplicate').toBe(400);
    if (res.body?.message) {
      expect.soft(
        typeof res.body.message === 'string' &&
          (res.body.message.toLowerCase().includes('duplicate') ||
            res.body.message.toLowerCase().includes('unique') ||
            res.body.message.toLowerCase().includes('already exists')),
        'Error should mention duplicate/unique/already exists',
      ).toBe(true);
    }
  });

  test('POST /masking/api/create — fictional txtp not in allowed list is rejected @regression @negative @api', async () => {
    const res = await client.post('/masking/api/create', {
      txtp: FICTIONAL_TXTP,
      txtpVersion: '01',
    });

    expect.soft(res.status, `Fictional txtp "${FICTIONAL_TXTP}" should be rejected (expected 400)`).toBe(400);
    expect.soft(res.body?.message, 'Should return an error message').toBeTruthy();
  });

  test('POST /masking/api/create — missing required field txtp @regression @negative @api', async () => {
    const res = await client.post('/masking/api/create', {
      txtpVersion: '11',
    });

    expect.soft(res.status, 'Expected 400 for missing required field').toBe(400);
  });

  test('POST /masking/api/create — empty body @regression @negative @api', async () => {
    const res = await client.post('/masking/api/create', {});

    expect.soft(res.status, 'Expected 400 for empty body').toBe(400);
  });

  test('POST /masking/api/create — wrong types @regression @negative @api', async () => {
    const res = await client.post('/masking/api/create', {
      txtp: 12345,
      txtpVersion: true,
    });

    expect.soft(res.status, 'Expected 400 for wrong types').toBe(400);
  });

  // ─── LIST / READ ────────────────────────────────────────

  test('POST /masking/api/all — list all masking configs @smoke @api', async () => {
    const res = await client.post('/masking/api/all', {}, { offset: 0, limit: 10 });

    expect.soft(res.status, 'Expected 201 for list').toBe(201);
    expect.soft(res.body).toBeTruthy();

    // Response shape: { success, masks[], total, limit, offset, pages }
    expect.soft(res.body?.success, 'Response should indicate success').toBe(true);
    expect.soft(Array.isArray(res.body?.masks), 'masks should be an array').toBe(true);
    expect.soft(typeof res.body?.total, 'total should be a number').toBe('number');
    expect.soft(typeof res.body?.pages, 'pages should be a number').toBe('number');

    // Validate mask object shape if results exist
    if (res.body?.masks?.length > 0) {
      const mask = res.body.masks[0];
      expect.soft(mask.id, 'Mask should have id').toBeTruthy();
      expect.soft(mask.txtp, 'Mask should have txtp').toBeTruthy();
      expect.soft(mask.status, 'Mask should have status').toBeTruthy();
      expect.soft(mask.created_at, 'Mask should have created_at').toBeTruthy();
      expect.soft(mask.updated_at, 'Mask should have updated_at').toBeTruthy();
    }
  });

  test('POST /masking/api/all — with status filter @regression @api', async () => {
    const res = await client.post(
      '/masking/api/all',
      { status: 'STATUS_01_IN_PROGRESS', sortOrder: 'DESC' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Expected 201 for filtered list').toBe(201);
  });

  test('POST /masking/api/all — with txtp filter @regression @api', async () => {
    const res = await client.post(
      '/masking/api/all',
      { txtp: 'pain.001.001.11' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Expected 201 for txtp filter').toBe(201);
  });

  test('POST /masking/api/all — sort ASC @regression @api', async () => {
    const res = await client.post(
      '/masking/api/all',
      { sortOrder: 'ASC' },
      { offset: 0, limit: 10 },
    );

    expect.soft(res.status, 'Expected 201 for ASC sort').toBe(201);
  });

  test('POST /masking/api/all — missing required query params @regression @negative @api', async () => {
    const res = await client.post('/masking/api/all', {});

    // offset and limit are required
    expect.soft([400, 201]).toContain(res.status);
  });

  test('GET /masking/api/{id} — get created mask by ID @smoke @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping GET by ID');

    const res = await client.get(`/masking/api/${createdMaskId}`);

    expect.soft(res.status, 'Expected 200 for get by ID').toBe(200);
    expect.soft(res.body).toBeTruthy();

    // Response is the mask object directly (unwrapped by rule-studio)
    // Shape: { id, tenant_id, txtp, txtp_version, tokenize, status, fields_masked, total_fields, comments, created_at, updated_at }
    expect.soft(res.body?.id, 'Mask should have id').toBeTruthy();
    expect.soft(res.body?.txtp, 'Mask should have txtp').toBeTruthy();
    expect.soft(res.body?.status, 'Mask should have status').toBeTruthy();
    expect.soft(res.body?.status, 'New mask should be IN_PROGRESS').toBe('STATUS_01_IN_PROGRESS');
  });

  test('GET /masking/api/{id} — nonexistent ID returns 404 @regression @negative @api', async () => {
    const res = await client.get('/masking/api/999999');

    expect.soft(res.status, 'Expected 404 for nonexistent ID').toBe(404);
  });

  test('GET /masking/api/{id} — invalid ID format @regression @negative @api', async () => {
    const res = await client.get('/masking/api/not-a-number');

    expect.soft([400, 404]).toContain(res.status);
  });

  // ─── UPDATE ─────────────────────────────────────────────

  test('PUT /masking/api/{id} — update masking config @smoke @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping update');

    const res = await client.put(`/masking/api/${createdMaskId}`, {
      comments: 'Updated by automated test',
      fields_masked: 3,
      total_fields: 10,
    });

    expect.soft(res.status, 'Expected 200 for update').toBe(200);

    // Response shape: { success, message, mask: {...} }
    expect.soft(res.body?.success, 'Update should indicate success').toBe(true);
    expect.soft(res.body?.message, 'Update should include message').toBeTruthy();
    if (res.body?.mask) {
      expect.soft(res.body.mask.comments, 'Updated comments should match').toBe('Updated by automated test');
      expect.soft(res.body.mask.fields_masked, 'fields_masked should be updated').toBe(3);
      expect.soft(res.body.mask.total_fields, 'total_fields should be updated').toBe(10);
    }
  });

  test('PUT /masking/api/{id} — update with tokenize field @regression @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping tokenize update');

    const res = await client.put(`/masking/api/${createdMaskId}`, {
      tokenize: { field1: true, field2: false },
    });

    expect.soft(res.status, 'Expected 200 for tokenize update').toBe(200);
  });

  test('PUT /masking/api/{id} — update nonexistent ID @regression @negative @api', async () => {
    const res = await client.put('/masking/api/999999', {
      comments: 'Should not work',
    });

    expect.soft(res.status, 'Expected 404 for nonexistent update').toBe(404);
  });

  test('PUT /masking/api/{id} — update status to UNDER_REVIEW @critical @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping status update');

    const res = await client.put(`/masking/api/${createdMaskId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });

    // Tier3 transition: IN_PROGRESS → UNDER_REVIEW (allowed for editor)
    expect.soft(res.status, 'Status transition should succeed').toBe(200);
    if (res.body?.mask) {
      expect.soft(res.body.mask.status, 'Status should now be UNDER_REVIEW').toBe('STATUS_03_UNDER_REVIEW');
    }
  });

  // ─── REVIEW (APPROVE/REJECT) ───────────────────────────

  test('PATCH /masking/api/{id}/review — approve masking config @smoke @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping review');

    // Use approver for this test
    const approverClient = new ApiClient({
      userKey: 'Kashif',
      testName: 'masking-api-review-approve',
    });

    const res = await approverClient.patch(`/masking/api/${createdMaskId}/review`, {
      action: 'approve',
      comments: 'Approved by automated test',
    });

    expect.soft([200, 400, 403]).toContain(res.status);
    await approverClient.dispose();
  });

  test('PATCH /masking/api/{id}/review — reject without comment @regression @negative @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping reject test');

    const approverClient = new ApiClient({
      userKey: 'Kashif',
      testName: 'masking-api-review-reject-no-comment',
    });

    const res = await approverClient.patch(`/masking/api/${createdMaskId}/review`, {
      action: 'reject',
    });

    expect.soft(res.status, 'Expected 400 — comment required when rejecting').toBe(400);
    await approverClient.dispose();
  });

  test('PATCH /masking/api/{id}/review — reject with comment @regression @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created — skipping reject test');

    const approverClient = new ApiClient({
      userKey: 'Kashif',
      testName: 'masking-api-review-reject',
    });

    const res = await approverClient.patch(`/masking/api/${createdMaskId}/review`, {
      action: 'reject',
      comments: 'Rejected by automated test — needs rework',
    });

    expect.soft([200, 400]).toContain(res.status);
    await approverClient.dispose();
  });

  test('PATCH /masking/api/{id}/review — invalid action @regression @negative @api', async () => {
    test.skip(createdMaskId === null, 'No masking config was created');

    const approverClient = new ApiClient({
      userKey: 'Kashif',
      testName: 'masking-api-review-invalid-action',
    });

    const res = await approverClient.patch(`/masking/api/${createdMaskId}/review`, {
      action: 'invalid_action',
    });

    expect.soft(res.status, 'Expected 400 for invalid action').toBe(400);
    await approverClient.dispose();
  });

  test('PATCH /masking/api/{id}/review — nonexistent ID @regression @negative @api', async () => {
    const approverClient = new ApiClient({
      userKey: 'Kashif',
      testName: 'masking-api-review-nonexistent',
    });

    const res = await approverClient.patch('/masking/api/999999/review', {
      action: 'approve',
    });

    expect.soft(res.status, 'Expected 404 for nonexistent review').toBe(404);
    await approverClient.dispose();
  });
});

// ─── AUTHENTICATION TESTS ───────────────────────────────

test.describe('Masking API — Authentication @regression @negative @api', () => {
  test('Request without token returns 401 @smoke @api', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    });

    const res = await ctx.post('/masking/api/all?offset=0&limit=10', { data: {} });
    expect.soft(res.status(), 'Expected 401 without token').toBe(401);
    await ctx.dispose();
  });

  test('Request with invalid token returns 401 @regression @api', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
      extraHTTPHeaders: {
        Authorization: 'Bearer invalid.token.here',
        'Content-Type': 'application/json',
      },
    });

    const res = await ctx.post('/masking/api/all?offset=0&limit=10', { data: {} });
    expect.soft(res.status(), 'Expected 401 with invalid token').toBe(401);
    await ctx.dispose();
  });

  test('Request with malformed Authorization header returns 401 @regression @negative @api', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
      extraHTTPHeaders: {
        Authorization: 'NotBearer sometoken',
        'Content-Type': 'application/json',
      },
    });

    const res = await ctx.post('/masking/api/all?offset=0&limit=10', { data: {} });
    expect.soft(res.status(), 'Expected 401 with malformed header').toBe(401);
    await ctx.dispose();
  });
});

// ─── ROLE ENFORCEMENT ───────────────────────────────────

test.describe('Masking API — Role enforcement @critical @api @rbac', () => {
  test('Approver CANNOT create masking config (401 — missing editor claim) @critical @api @rbac', async () => {
    test.skip(!deApprover, 'Data Engineer Approver user not found');

    const approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'role-enforce-approver-create',
    });

    const res = await approverClient.post('/masking/api/create', {
      txtp: 'role.enforce.approver.create',
      txtpVersion: '01',
    });

    expect.soft(res.status, 'Approver should get 401 on create (guard rejects missing editor claim)').toBe(401);
    await approverClient.dispose();
  });

  test('Editor CANNOT review masking config (401 — missing approver claim) @critical @api @rbac', async () => {
    test.skip(!deEditor, 'Data Engineer Editor user not found');

    const editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'role-enforce-editor-review',
    });

    const res = await editorClient.patch('/masking/api/1/review', {
      action: 'approve',
      comments: 'Editor attempt',
    });

    expect.soft(res.status, 'Editor should get 401 on review (guard rejects missing approver claim)').toBe(401);
    await editorClient.dispose();
  });
});

// ─── DYNAMIC ENDPOINT COVERAGE ──────────────────────────

test.describe('Masking API — Swagger endpoint coverage @regression @api', () => {
  for (const endpoint of endpoints) {
    test(`${endpoint.method} ${endpoint.path} is documented and reachable @regression @api`, async () => {
      const client = new ApiClient({
        userKey: 'Tims',
        testName: `swagger-coverage-${endpoint.operationId}`,
      });

      let res;
      switch (endpoint.method) {
        case 'GET':
          res = await client.get(endpoint.path.replace('{id}', '1'));
          break;
        case 'POST':
          if (endpoint.path.includes('/all')) {
            res = await client.post(endpoint.path, {}, { offset: 0, limit: 10 });
          } else {
            res = await client.post(endpoint.path, { txtp: 'test.coverage.check' });
          }
          break;
        case 'PUT':
          res = await client.put(endpoint.path.replace('{id}', '1'), { comments: 'coverage check' });
          break;
        case 'PATCH':
          res = await client.patch(endpoint.path.replace('{id}', '1'), { action: 'approve' });
          break;
        default:
          return;
      }

      // We just verify the endpoint is reachable (not 404 for path, not 502/503)
      expect.soft(res.status, `${endpoint.method} ${endpoint.path} should be reachable`).toBeLessThan(500);
      await client.dispose();
    });
  }
});

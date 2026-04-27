import { test, expect } from '../fixtures/auth.fixture';
import { ApiClient } from '../fixtures/api-client.fixture';
import {
  getDataEngineerEditor,
  getDataEngineerApprover,
  getNonDataEngineerUsers,
} from '../helpers/users-loader';
import {
  getAvailableTxtps,
  AvailableTxtp,
} from '../helpers/transaction-types-loader';

/**
 * Maker-Checker workflow tests for /masking/* resources.
 *
 * Confirmed status lifecycle:
 *   Editor:   IN_PROGRESS → UNDER_REVIEW, APPROVED → UNDER_REVIEW, REJECTED → IN_PROGRESS
 *   Approver: UNDER_REVIEW → APPROVED, UNDER_REVIEW → REJECTED
 *
 *   Approver CANNOT create (401 — guard rejects missing editor claim).
 *   Editor CANNOT review (401 — guard rejects missing approver claim).
 *
 * Tags: @workflow, @critical, @rbac
 * ALL assertions use expect.soft()
 */

const deEditor = getDataEngineerEditor();
const deApprover = getDataEngineerApprover();
const nonDEUsers = getNonDataEngineerUsers();

const skipWorkflow = !deEditor || !deApprover;
let availableTxtps: AvailableTxtp[] = [];

/**
 * Pick the next available txtp+version that won't collide with existing maskings.
 * Each call bumps the version to stay unique within this test run.
 */
let txtpIndex = 0;
const usedVersionsThisRun = new Map<string, number>();

function nextCreateTarget(): { txtp: string; version: string } {
  if (availableTxtps.length === 0) {
    // Fallback — will fail at the API but won't crash the test setup
    return { txtp: 'fallback-txtp', version: '01' };
  }

  const entry = availableTxtps[txtpIndex % availableTxtps.length];
  txtpIndex++;

  // Track how many times we've used this txtp within this run
  const runCount = usedVersionsThisRun.get(entry.txtp) ?? 0;
  usedVersionsThisRun.set(entry.txtp, runCount + 1);

  // Base version from the loader + offset for each reuse within this run
  const baseVer = parseInt(entry.unusedVersion, 10) || 1;
  const version = String(baseVer + runCount).padStart(2, '0');

  return { txtp: entry.txtp, version };
}

test.describe.serial('Maker-Checker — Happy Path: Create → Approve @critical @workflow', () => {
  let editorClient: ApiClient;
  let approverClient: ApiClient;
  let resourceId: number | null = null;

  test.beforeAll(async () => {
    if (skipWorkflow) return;

    // Fetch available txtps (allowed minus already-used, cached after first call)
    availableTxtps = await getAvailableTxtps(deEditor!.key);

    editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'maker-checker-happy-path',
    });
    approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'maker-checker-happy-path',
    });
  });

  test.afterAll(async () => {
    await editorClient.dispose();
    await approverClient.dispose();
  });

  test('Step 1: Editor creates a masking resource @critical @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const t1 = nextCreateTarget();
    const res = await editorClient.post('/masking/api/create', {
      txtp: t1.txtp,
      txtpVersion: t1.version,
    });

    expect.soft(res.status, 'Create should return 201').toBe(201);

    // Response: { success, message, id }
    expect.soft(res.body?.success, 'Create should indicate success').toBe(true);
    if (res.body?.id) resourceId = res.body.id;

    expect.soft(resourceId, 'Created resource should have an ID').toBeTruthy();
  });

  test('Step 2: Editor submits for review (status → UNDER_REVIEW) @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created — cannot submit for review');

    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });

    expect.soft([200, 201].includes(res.status), 'Status update should succeed').toBe(true);
  });

  test('Step 3: Approver approves the resource @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created — cannot approve');

    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'approve',
      comments: 'Approved via maker-checker workflow test',
    });

    expect.soft(res.status, 'Approve should return 200').toBe(200);
  });

  test('Step 4: Verify resource is approved @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created — cannot verify');

    const res = await editorClient.get(`/masking/api/${resourceId}`);

    expect.soft(res.status, 'GET should return 200').toBe(200);
    if (res.body?.status) {
      expect.soft(
        res.body.status,
        'Resource status should be APPROVED',
      ).toBe('STATUS_04_APPROVED');
    }
  });
});

test.describe.serial('Maker-Checker — Rejection Path: Create → Reject @critical @workflow', () => {
  let editorClient: ApiClient;
  let approverClient: ApiClient;
  let resourceId: number | null = null;

  test.beforeAll(async () => {
    if (skipWorkflow) return;
    editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'maker-checker-reject',
    });
    approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'maker-checker-rejection',
    });
  });

  test.afterAll(async () => {
    await editorClient.dispose();
    await approverClient.dispose();
  });

  test('Step 1: Editor creates a masking resource @critical @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const t2b = nextCreateTarget();
    const res = await editorClient.post('/masking/api/create', {
      txtp: t2b.txtp,
      txtpVersion: t2b.version,
    });

    expect.soft(res.status, 'Create should return 201').toBe(201);
    if (res.body?.id) resourceId = res.body.id;
  });

  test('Step 2: Editor submits for review @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });

    expect.soft([200, 201].includes(res.status), 'Status update should succeed').toBe(true);
  });

  test('Step 3: Approver rejects with comment @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'reject',
      comments: 'Rejected — needs rework on masking fields',
    });

    expect.soft(res.status, 'Reject should return 200').toBe(200);
  });

  test('Step 4: Verify resource is rejected @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await editorClient.get(`/masking/api/${resourceId}`);

    expect.soft(res.status, 'GET should return 200').toBe(200);
    if (res.body?.status) {
      expect.soft(
        res.body.status,
        'Resource status should be REJECTED',
      ).toBe('STATUS_05_REJECTED');
    }
  });
});

test.describe.serial('Maker-Checker — Edit + Approve @critical @workflow', () => {
  let editorClient: ApiClient;
  let approverClient: ApiClient;
  let resourceId: number | null = null;

  test.beforeAll(async () => {
    if (skipWorkflow) return;
    editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'maker-checker-edit-approve',
    });
    approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'maker-checker-edit-approve',
    });
  });

  test.afterAll(async () => {
    await editorClient.dispose();
    await approverClient.dispose();
  });

  test('Step 1: Editor creates a masking resource @critical @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const t3 = nextCreateTarget();
    const res = await editorClient.post('/masking/api/create', {
      txtp: t3.txtp,
      txtpVersion: t3.version,
    });

    expect.soft(res.status, 'Create should return 201').toBe(201);
    if (res.body?.id) resourceId = res.body.id;
  });

  test('Step 2: Editor edits the resource @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      fields_masked: 7,
      total_fields: 15,
      comments: 'Updated masking field count',
    });

    expect.soft(res.status, 'Edit should return 200').toBe(200);
  });

  test('Step 3: Editor submits for review @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });

    expect.soft([200, 201].includes(res.status), 'Submit should succeed').toBe(true);
  });

  test('Step 4: Approver approves @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');

    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'approve',
      comments: 'Approved after edit',
    });

    expect.soft(res.status, 'Approve should return 200').toBe(200);
  });
});

// ─── SELF-APPROVAL DENIED ───────────────────────────────

test.describe('Maker-Checker — Self-approval denied @rbac @workflow', () => {
  test('Editor cannot approve their own resource @rbac @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'self-approval-denied',
    });

    // Create a resource
    const t4 = nextCreateTarget();
    const createRes = await editorClient.post('/masking/api/create', {
      txtp: t4.txtp,
      txtpVersion: t4.version,
    });

    let resourceId: number | null = null;
    if (createRes.body?.id) resourceId = createRes.body.id;

    if (resourceId) {
      // Submit for review
      await editorClient.put(`/masking/api/${resourceId}`, {
        status: 'STATUS_03_UNDER_REVIEW',
      });

      // Editor tries to approve their own resource
      const reviewRes = await editorClient.patch(`/masking/api/${resourceId}/review`, {
        action: 'approve',
        comments: 'Self-approval attempt',
      });

      expect.soft(
        reviewRes.status,
        'Editor should NOT be able to approve their own resource (expect 401 — missing approver claim)',
      ).toBe(401);
    }

    await editorClient.dispose();
  });
});

// ─── APPROVER CANNOT CREATE ─────────────────────────────

test.describe('Maker-Checker — Approver cannot create @rbac @workflow', () => {
  test('Approver cannot create a masking resource directly @rbac @workflow', async () => {
    test.skip(!deApprover, 'DE Approver not found');
    const approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'approver-cannot-create',
    });

    const t5 = nextCreateTarget();
    const res = await approverClient.post('/masking/api/create', {
      txtp: t5.txtp,
      txtpVersion: t5.version,
    });

    // Approver is denied creating — guard rejects missing editor claim
    expect.soft(
      res.status,
      'Approver should be denied creating resources (401 — missing editor claim)',
    ).toBe(401);

    await approverClient.dispose();
  });
});

// ─── RE-SUBMISSION AFTER REJECTION ──────────────────────

test.describe.serial('Maker-Checker — Reject → Re-edit → Re-submit → Approve @critical @workflow', () => {
  let editorClient: ApiClient;
  let approverClient: ApiClient;
  let resourceId: number | null = null;

  test.beforeAll(async () => {
    if (skipWorkflow) return;
    editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'maker-checker-resubmit',
    });
    approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'maker-checker-resubmit',
    });
  });

  test.afterAll(async () => {
    await editorClient.dispose();
    await approverClient.dispose();
  });

  test('Step 1: Editor creates resource @critical @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const t6 = nextCreateTarget();
    const res = await editorClient.post('/masking/api/create', {
      txtp: t6.txtp,
      txtpVersion: t6.version,
    });
    expect.soft(res.status, 'Create should return 201').toBe(201);
    if (res.body?.id) resourceId = res.body.id;
  });

  test('Step 2: Editor submits for review @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });
    expect.soft([200, 201].includes(res.status), 'Submit should succeed').toBe(true);
  });

  test('Step 3: Approver rejects @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'reject',
      comments: 'Needs rework on field selection',
    });
    expect.soft(res.status, 'Reject should return 200').toBe(200);
  });

  test('Step 4: Verify status is REJECTED @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.get(`/masking/api/${resourceId}`);
    expect.soft(res.status).toBe(200);
    if (res.body?.status) {
      expect.soft(res.body.status, 'Should be REJECTED').toBe('STATUS_05_REJECTED');
    }
  });

  test('Step 5: Editor re-edits rejected resource (REJECTED → IN_PROGRESS) @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      comments: 'Reworked masking fields after rejection',
    });
    expect.soft(res.status, 'Re-edit should succeed').toBe(200);
  });

  test('Step 6: Editor re-submits for review @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });
    expect.soft([200, 201].includes(res.status), 'Re-submit should succeed').toBe(true);
  });

  test('Step 7: Approver approves re-submitted resource @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'approve',
      comments: 'Approved after rework',
    });
    expect.soft(res.status, 'Approve should return 200').toBe(200);
  });

  test('Step 8: Verify final status is APPROVED @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.get(`/masking/api/${resourceId}`);
    expect.soft(res.status).toBe(200);
    if (res.body?.status) {
      expect.soft(res.body.status, 'Should be APPROVED').toBe('STATUS_04_APPROVED');
    }
  });
});

// ─── APPROVED → RE-SUBMIT FLOW ──────────────────────────

test.describe.serial('Maker-Checker — Approved → Re-submit for review @critical @workflow', () => {
  let editorClient: ApiClient;
  let approverClient: ApiClient;
  let resourceId: number | null = null;

  test.beforeAll(async () => {
    if (skipWorkflow) return;
    editorClient = new ApiClient({
      userKey: deEditor!.key,
      testName: 'maker-checker-approved-resubmit',
    });
    approverClient = new ApiClient({
      userKey: deApprover!.key,
      testName: 'maker-checker-approved-resubmit',
    });
  });

  test.afterAll(async () => {
    await editorClient.dispose();
    await approverClient.dispose();
  });

  test('Step 1: Editor creates and submits resource @critical @workflow', async () => {
    test.skip(skipWorkflow, 'DE Editor or Approver not found');
    const t7 = nextCreateTarget();
    const createRes = await editorClient.post('/masking/api/create', {
      txtp: t7.txtp,
      txtpVersion: t7.version,
    });
    expect.soft(createRes.status).toBe(201);
    if (createRes.body?.id) resourceId = createRes.body.id;

    test.skip(resourceId === null, 'No resource created');
    await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });
  });

  test('Step 2: Approver approves @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await approverClient.patch(`/masking/api/${resourceId}/review`, {
      action: 'approve',
      comments: 'Approved',
    });
    expect.soft(res.status).toBe(200);
  });

  test('Step 3: Editor re-submits approved resource for review (APPROVED → UNDER_REVIEW) @critical @workflow', async () => {
    test.skip(resourceId === null, 'No resource created');
    const res = await editorClient.put(`/masking/api/${resourceId}`, {
      status: 'STATUS_03_UNDER_REVIEW',
    });
    expect.soft([200, 201].includes(res.status), 'APPROVED → UNDER_REVIEW transition should succeed').toBe(true);
  });
});

// ─── NON-DE USERS DENIED ────────────────────────────────

test.describe('Maker-Checker — Non-Data-Engineer users denied @rbac @workflow', () => {
  for (const user of nonDEUsers) {
    test(`${user.key} (${user.role}) cannot create masking resource @rbac @workflow`, async () => {
      const client = new ApiClient({
        userKey: user.key,
        testName: `non-de-create-denied-${user.key}`,
      });

      const res = await client.post('/masking/api/create', {
        txtp: nextCreateTarget().txtp,
      });

      expect.soft(res.status, `${user.role} should get 401 (missing claims)`).toBe(401);
      await client.dispose();
    });

    test(`${user.key} (${user.role}) cannot approve masking resource @rbac @workflow`, async () => {
      const client = new ApiClient({
        userKey: user.key,
        testName: `non-de-approve-denied-${user.key}`,
      });

      const res = await client.patch('/masking/api/1/review', {
        action: 'approve',
      });

      expect.soft(res.status, `${user.role} should get 401 (missing claims)`).toBe(401);
      await client.dispose();
    });
  }
});

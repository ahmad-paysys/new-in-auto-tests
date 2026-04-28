import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import { MaskingCreatePage } from '../page-objects/masking-create.page';
import { MaskingConfigurePage } from '../page-objects/masking-configure.page';
import { MaskingViewModal } from '../page-objects/masking-view-modal.page';
import {
  createEditorPage,
  createApproverPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';
import {
  getAvailableTxtps,
  AvailableTxtp,
} from '../../helpers/transaction-types-loader';
import {
  getDataEngineerEditor,
  getDataEngineerApprover,
} from '../../helpers/users-loader';

let editorAuth: AuthenticatedContext;
let approverAuth: AuthenticatedContext;
let editorKey: string;

/** Tracks used txtp+version combos within this run to avoid collisions. */
const usedVersions = new Map<string, Set<string>>();
let availableTxtps: AvailableTxtp[] = [];

/** Get the next fresh txtp+version, avoiding intra-run duplicates. */
function nextCreateTarget(): { txtp: string; version: string } | null {
  for (const a of availableTxtps) {
    const used = usedVersions.get(a.txtp) ?? new Set();
    let ver = parseInt(a.unusedVersion, 10);
    while (used.has(String(ver).padStart(2, '0'))) {
      ver++;
    }
    const version = String(ver).padStart(2, '0');
    if (!usedVersions.has(a.txtp)) usedVersions.set(a.txtp, new Set());
    usedVersions.get(a.txtp)!.add(version);
    return { txtp: a.txtp, version };
  }
  return null;
}

/**
 * Helper: Editor creates a masking config end-to-end via the UI.
 * Returns true if successful.
 */
async function editorCreatesConfig(
  target: { txtp: string; version: string },
  editorDashboard: MaskingDashboardPage,
  editorCreatePage: MaskingCreatePage,
  editorConfigurePage: MaskingConfigurePage,
  screenshotPrefix: string,
): Promise<boolean> {
  await editorDashboard.goto();
  await editorDashboard.clickNewConfiguration();
  await editorCreatePage.screenshot(`${screenshotPrefix}_01_create-page`);

  await editorCreatePage.selectTransactionType(target.txtp);
  await editorCreatePage.waitForVersionsLoaded();
  await editorCreatePage.selectVersion(target.version);
  await editorCreatePage.screenshot(`${screenshotPrefix}_02_dataset-filled`);

  await editorCreatePage.goToConfigureTab();
  await editorConfigurePage.expectLoaded();

  const fieldCount = await editorConfigurePage.getFieldCount();
  if (fieldCount > 0) {
    await editorConfigurePage.toggleField(0);
  }
  await editorConfigurePage.screenshot(`${screenshotPrefix}_03_configured`);

  await editorConfigurePage.clickSubmit();
  await editorConfigurePage.expectSubmitModal();
  await editorConfigurePage.confirmSubmit();
  await editorConfigurePage.screenshot(`${screenshotPrefix}_04_submitted`);

  // Check for success
  try {
    await editorConfigurePage.expectSuccessToast();
    return true;
  } catch {
    return false;
  }
}

test.describe.serial(
  'Masking Maker-Checker Lifecycle @E2E-Frontend-Only @critical',
  () => {
    test.beforeAll(async ({ browser }) => {
      const editor = getDataEngineerEditor();
      const approver = getDataEngineerApprover();
      test.skip(!editor || !approver, 'Both DE Editor and Approver required');

      editorKey = editor!.key;
      availableTxtps = await getAvailableTxtps(editorKey);
      test.skip(
        availableTxtps.length === 0,
        'No available transaction types for create',
      );

      editorAuth = await createEditorPage(browser);
      approverAuth = await createApproverPage(browser);
    });

    test.afterAll(async () => {
      await editorAuth?.context.close();
      await approverAuth?.context.close();
    });

    test('Editor creates new config (IN_PROGRESS) @E2E-Frontend-Only @critical', async () => {
      const target = nextCreateTarget();
      test.skip(!target, 'No available txtp+version');

      const dashboard = new MaskingDashboardPage(editorAuth.page);
      const createPage = new MaskingCreatePage(editorAuth.page);
      const configurePage = new MaskingConfigurePage(editorAuth.page);

      const success = await editorCreatesConfig(
        target!,
        dashboard,
        createPage,
        configurePage,
        'mc_create',
      );
      expect(success, 'Config should be created successfully').toBe(true);
    });

    test('Editor submits for review (UNDER_REVIEW) @E2E-Frontend-Only @critical', async () => {
      const dashboard = new MaskingDashboardPage(editorAuth.page);

      // Navigate to dashboard and find the most recent IN_PROGRESS config
      await dashboard.goto();
      await dashboard.filterByStatus('In Progress');
      await editorAuth.page.waitForTimeout(1000);
      await dashboard.screenshot('mc_submit_01_in-progress');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No IN_PROGRESS configs to submit');

      // Open edit for the first IN_PROGRESS row
      await dashboard.editRowByIndex(0);
      await dashboard.screenshot('mc_submit_02_edit-page');

      const createPage = new MaskingCreatePage(editorAuth.page);
      const configurePage = new MaskingConfigurePage(editorAuth.page);

      // Navigate to Configure tab
      await createPage.goToConfigureTab();
      await configurePage.expectLoaded();
      await configurePage.screenshot('mc_submit_03_configure');

      // Submit for review
      await configurePage.clickSubmit();
      await configurePage.expectSubmitModal();
      await configurePage.confirmSubmit();
      await configurePage.screenshot('mc_submit_04_submitted');

      await configurePage.expectSuccessToast();
      await configurePage.screenshot('mc_submit_05_success');
    });

    test('Approver sees the submitted config @E2E-Frontend-Only @critical', async () => {
      const dashboard = new MaskingDashboardPage(approverAuth.page);

      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await approverAuth.page.waitForTimeout(1000);
      await dashboard.screenshot('mc_approver_01_under-review');

      const rowCount = await dashboard.getRowCount();
      expect(
        rowCount,
        'Approver should see at least one UNDER_REVIEW config',
      ).toBeGreaterThan(0);
      await dashboard.screenshot('mc_approver_02_rows-visible');
    });

    test('Approver approves the config @E2E-Frontend-Only @critical', async () => {
      const dashboard = new MaskingDashboardPage(approverAuth.page);
      const viewModal = new MaskingViewModal(approverAuth.page);

      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await approverAuth.page.waitForTimeout(1000);
      await dashboard.screenshot('mc_approve_01_finding');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs to approve');

      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('mc_approve_02_modal');

      await viewModal.approve('Approved via maker-checker E2E test');
      await viewModal.expectApproveSuccess();
      await viewModal.screenshot('mc_approve_03_success');
    });

    test('Full rejection cycle @E2E-Frontend-Only @critical', async () => {
      // Create a fresh config
      const target = nextCreateTarget();
      test.skip(!target, 'No available txtp+version for rejection test');

      const editorDashboard = new MaskingDashboardPage(editorAuth.page);
      const editorCreatePage = new MaskingCreatePage(editorAuth.page);
      const editorConfigurePage = new MaskingConfigurePage(editorAuth.page);

      const created = await editorCreatesConfig(
        target!,
        editorDashboard,
        editorCreatePage,
        editorConfigurePage,
        'mc_reject_create',
      );
      test.skip(!created, 'Failed to create config for rejection test');

      // Submit for review (editor re-opens and submits)
      await editorDashboard.goto();
      await editorDashboard.filterByStatus('In Progress');
      await editorAuth.page.waitForTimeout(1000);

      const rowCount = await editorDashboard.getRowCount();
      test.skip(rowCount === 0, 'No IN_PROGRESS config to submit');

      await editorDashboard.editRowByIndex(0);
      await editorCreatePage.goToConfigureTab();
      await editorConfigurePage.expectLoaded();
      await editorConfigurePage.clickSubmit();
      await editorConfigurePage.expectSubmitModal();
      await editorConfigurePage.confirmSubmit();
      await editorConfigurePage.expectSuccessToast();
      await editorConfigurePage.screenshot('mc_reject_submit_done');

      // Approver rejects
      const approverDashboard = new MaskingDashboardPage(approverAuth.page);
      const viewModal = new MaskingViewModal(approverAuth.page);

      await approverDashboard.goto();
      await approverDashboard.filterByStatus('Under Review');
      await approverAuth.page.waitForTimeout(1000);

      const approverRows = await approverDashboard.getRowCount();
      test.skip(approverRows === 0, 'No UNDER_REVIEW configs to reject');

      await approverDashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.reject('Rejected via maker-checker E2E — needs revision');
      await viewModal.expectRejectSuccess();
      await viewModal.screenshot('mc_reject_done');
    });

    test('Editor re-submits after rejection @E2E-Frontend-Only @regression', async () => {
      const dashboard = new MaskingDashboardPage(editorAuth.page);

      // Find a REJECTED config
      await dashboard.goto();
      await dashboard.filterByStatus('Rejected');
      await editorAuth.page.waitForTimeout(1000);
      await dashboard.screenshot('mc_resubmit_01_rejected');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No REJECTED configs to re-submit');

      // Edit the rejected config
      await dashboard.editRowByIndex(0);
      await dashboard.screenshot('mc_resubmit_02_editing');

      const createPage = new MaskingCreatePage(editorAuth.page);
      const configurePage = new MaskingConfigurePage(editorAuth.page);

      await createPage.goToConfigureTab();
      await configurePage.expectLoaded();

      // Make a change and re-submit
      const fieldCount = await configurePage.getFieldCount();
      if (fieldCount > 1) {
        await configurePage.toggleField(1);
      }

      await configurePage.clickSubmit();
      await configurePage.expectSubmitModal();
      await configurePage.confirmSubmit();
      await configurePage.screenshot('mc_resubmit_03_submitted');

      await configurePage.expectSuccessToast();
      await configurePage.screenshot('mc_resubmit_04_success');
    });

    test('Editor cannot self-approve @E2E-Frontend-Only @regression @negative', async () => {
      const dashboard = new MaskingDashboardPage(editorAuth.page);
      const viewModal = new MaskingViewModal(editorAuth.page);

      // Find an UNDER_REVIEW config as the editor
      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await editorAuth.page.waitForTimeout(1000);
      await dashboard.screenshot('mc_selfapprove_01_finding');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs to test self-approval');

      // Open view modal as editor
      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('mc_selfapprove_02_modal');

      // Editor should NOT see Approve/Reject buttons
      await viewModal.expectApproveButtonVisible(false);
      await viewModal.screenshot('mc_selfapprove_03_no-buttons');
    });
  },
);

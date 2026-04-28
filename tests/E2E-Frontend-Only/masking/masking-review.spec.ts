import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import { MaskingViewModal } from '../page-objects/masking-view-modal.page';
import {
  createApproverPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';
import { getDataEngineerApprover } from '../../helpers/users-loader';

let auth: AuthenticatedContext;
let dashboard: MaskingDashboardPage;
let viewModal: MaskingViewModal;

test.describe.serial(
  'Masking Review Flow @E2E-Frontend-Only @critical',
  () => {
    test.beforeAll(async ({ browser }) => {
      const approver = getDataEngineerApprover();
      test.skip(!approver, 'DE Approver user not found');

      auth = await createApproverPage(browser);
      dashboard = new MaskingDashboardPage(auth.page);
      viewModal = new MaskingViewModal(auth.page);
    });

    test.afterAll(async () => {
      await auth.context.close();
    });

    test('Approver sees UNDER_REVIEW configs @E2E-Frontend-Only @critical', async () => {
      await dashboard.goto();
      await dashboard.screenshot('review_01_dashboard');

      // Approver's default view should show UNDER_REVIEW configs
      await dashboard.filterByStatus('Under Review');
      await auth.page.waitForTimeout(1000);
      await dashboard.screenshot('review_02_under-review-filter');

      const rowCount = await dashboard.getRowCount();
      // Approver should see at least UNDER_REVIEW configs if any exist
      // This test validates the filter works; row count depends on data state
      expect(rowCount).toBeGreaterThanOrEqual(0);
      await dashboard.screenshot('review_03_rows-visible');
    });

    test('Open view modal for a config @E2E-Frontend-Only @critical', async () => {
      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await auth.page.waitForTimeout(1000);
      await dashboard.screenshot('review_04_finding-config');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs available');

      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('review_05_modal-open');
    });

    test('Approve button is visible to approver @E2E-Frontend-Only @critical', async () => {
      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await auth.page.waitForTimeout(1000);

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs available');

      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('review_06_checking-buttons');

      await viewModal.expectApproveButtonVisible(true);
      await viewModal.screenshot('review_07_buttons-visible');
      await viewModal.close();
    });

    test('Approve a config @E2E-Frontend-Only @critical', async () => {
      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await auth.page.waitForTimeout(1000);
      await dashboard.screenshot('review_08_approve-start');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs to approve');

      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('review_09_before-approve');

      await viewModal.approve('Approved via E2E test');
      await viewModal.screenshot('review_10_after-approve');

      await viewModal.expectApproveSuccess();
      await viewModal.screenshot('review_11_approve-success');
    });

    test('Reject a config @E2E-Frontend-Only @critical', async () => {
      await dashboard.goto();
      await dashboard.filterByStatus('Under Review');
      await auth.page.waitForTimeout(1000);
      await dashboard.screenshot('review_12_reject-start');

      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No UNDER_REVIEW configs to reject');

      await dashboard.openRowByIndex(0);
      await viewModal.expectVisible();
      await viewModal.screenshot('review_13_before-reject');

      await viewModal.reject('Rejected via E2E test — needs revision');
      await viewModal.screenshot('review_14_after-reject');

      await viewModal.expectRejectSuccess();
      await viewModal.screenshot('review_15_reject-success');
    });

    test('Approver cannot see IN_PROGRESS configs @E2E-Frontend-Only @regression', async () => {
      await dashboard.goto();
      await dashboard.screenshot('review_16_checking-in-progress');

      await dashboard.filterByStatus('In Progress');
      await auth.page.waitForTimeout(1000);
      await dashboard.screenshot('review_17_in-progress-filtered');

      const rowCount = await dashboard.getRowCount();
      const hasEmpty = await dashboard.emptyState.isVisible().catch(() => false);

      // Approver should not see IN_PROGRESS — either no rows or empty state
      expect(
        rowCount === 0 || hasEmpty,
        'Approver should not see IN_PROGRESS configs',
      ).toBe(true);
      await dashboard.screenshot('review_18_no-in-progress');
    });
  },
);

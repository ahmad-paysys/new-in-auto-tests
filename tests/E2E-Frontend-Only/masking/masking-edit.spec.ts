import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import { MaskingCreatePage } from '../page-objects/masking-create.page';
import { MaskingConfigurePage } from '../page-objects/masking-configure.page';
import {
  createEditorPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';
import { getDataEngineerEditor } from '../../helpers/users-loader';

let auth: AuthenticatedContext;
let dashboard: MaskingDashboardPage;
let createPage: MaskingCreatePage;
let configurePage: MaskingConfigurePage;

test.describe.serial('Masking Edit Flow @E2E-Frontend-Only @critical', () => {
  test.beforeAll(async ({ browser }) => {
    const editor = getDataEngineerEditor();
    test.skip(!editor, 'DE Editor user not found');

    auth = await createEditorPage(browser);
    dashboard = new MaskingDashboardPage(auth.page);
    createPage = new MaskingCreatePage(auth.page);
    configurePage = new MaskingConfigurePage(auth.page);
  });

  test.afterAll(async () => {
    await auth.context.close();
  });

  test('Open edit page for existing config @E2E-Frontend-Only @critical', async () => {
    await dashboard.goto();
    await dashboard.screenshot('edit_01_dashboard');

    // Filter to IN_PROGRESS to find an editable config
    await dashboard.filterByStatus('In Progress');
    await auth.page.waitForTimeout(1000);
    await dashboard.screenshot('edit_02_filtered');

    const rowCount = await dashboard.getRowCount();
    test.skip(rowCount === 0, 'No IN_PROGRESS configs available to edit');

    await dashboard.editRowByIndex(0);
    await dashboard.screenshot('edit_03_edit-page');

    await expect(auth.page).toHaveURL(/\/masking-config\/action/);
    // URL should contain mode=edit and an id
    const url = auth.page.url();
    expect(url).toContain('mode=edit');
    expect(url).toMatch(/id=\d+/);
  });

  test('Edit page pre-fills existing data @E2E-Frontend-Only @critical', async () => {
    // We should be on the edit page from the previous test
    // If not, navigate to dashboard and open one
    if (!auth.page.url().includes('mode=edit')) {
      await dashboard.goto();
      await dashboard.filterByStatus('In Progress');
      await auth.page.waitForTimeout(1000);
      const rowCount = await dashboard.getRowCount();
      test.skip(rowCount === 0, 'No IN_PROGRESS configs to edit');
      await dashboard.editRowByIndex(0);
    }

    await createPage.screenshot('edit_04_prefilled');

    // In edit mode, the txtp and version fields should be present (disabled)
    await expect(createPage.messageTypeDropdown).toBeVisible();
    await expect(createPage.versionDropdown).toBeVisible();
    await createPage.screenshot('edit_05_fields-visible');
  });

  test('Modify masking fields and save @E2E-Frontend-Only @critical', async () => {
    // Navigate fresh to an editable config
    await dashboard.goto();
    await dashboard.filterByStatus('In Progress');
    await auth.page.waitForTimeout(1000);
    await dashboard.screenshot('edit_06_finding-editable');

    const rowCount = await dashboard.getRowCount();
    test.skip(rowCount === 0, 'No IN_PROGRESS configs to edit');

    await dashboard.editRowByIndex(0);
    await createPage.screenshot('edit_07_on-edit-page');

    // Go to Configure tab (in edit mode the button text is "Next")
    await createPage.goToConfigureTab();
    await configurePage.expectLoaded();
    await configurePage.screenshot('edit_08_configure-tab');

    // Toggle a field to make a change
    const fieldCount = await configurePage.getFieldCount();
    test.skip(fieldCount === 0, 'No fields to toggle');

    await configurePage.toggleField(0);
    await configurePage.screenshot('edit_09_field-toggled');

    // Submit changes
    await configurePage.clickSubmit();
    await configurePage.expectSubmitModal();
    await configurePage.confirmSubmit();
    await configurePage.screenshot('edit_10_submitted');

    await configurePage.expectSuccessToast();
    await configurePage.screenshot('edit_11_success');
  });

  test('Editor cannot edit UNDER_REVIEW config @E2E-Frontend-Only @regression @negative', async () => {
    await dashboard.goto();
    await dashboard.filterByStatus('Under Review');
    await auth.page.waitForTimeout(1000);
    await dashboard.screenshot('edit_12_under-review-filter');

    const rowCount = await dashboard.getRowCount();
    test.skip(rowCount === 0, 'No UNDER_REVIEW configs to test');

    // The Edit icon should NOT be visible for UNDER_REVIEW rows
    const firstRow = dashboard.tableRows.nth(0);
    const editButton = firstRow.getByTitle('Edit');
    const editVisible = await editButton.isVisible().catch(() => false);

    expect(
      editVisible,
      'Edit button should not be visible for UNDER_REVIEW configs',
    ).toBe(false);
    await dashboard.screenshot('edit_13_no-edit-button');
  });
});

import { test, expect } from '@playwright/test';
import { MaskingDashboardPage } from '../page-objects/masking-dashboard.page';
import { MaskingCreatePage } from '../page-objects/masking-create.page';
import { MaskingConfigurePage } from '../page-objects/masking-configure.page';
import {
  createEditorPage,
  AuthenticatedContext,
} from '../helpers/browser-auth.helper';
import {
  getCreateableTxtp,
  fetchVersionsForType,
  fetchExistingMaskings,
} from '../../helpers/transaction-types-loader';
import { getDataEngineerEditor } from '../../helpers/users-loader';

let auth: AuthenticatedContext;
let dashboard: MaskingDashboardPage;
let createPage: MaskingCreatePage;
let configurePage: MaskingConfigurePage;
let editorKey: string;

test.describe.serial(
  'Masking Create Flow @E2E-Frontend-Only @critical',
  () => {
    test.beforeAll(async ({ browser }) => {
      const editor = getDataEngineerEditor();
      test.skip(!editor, 'DE Editor user not found');
      editorKey = editor!.key;

      auth = await createEditorPage(browser);
      dashboard = new MaskingDashboardPage(auth.page);
      createPage = new MaskingCreatePage(auth.page);
      configurePage = new MaskingConfigurePage(auth.page);
    });

    test.afterAll(async () => {
      await auth.context.close();
    });

    test('Navigate to create page @E2E-Frontend-Only @smoke', async () => {
      await dashboard.goto();
      await dashboard.screenshot('create_01_dashboard');

      await dashboard.clickNewConfiguration();
      await createPage.screenshot('create_02_create-page');

      await expect(auth.page).toHaveURL(/\/masking-config\/action/);
    });

    test('Dataset tab shows txtp dropdown @E2E-Frontend-Only @critical', async () => {
      await createPage.goto();
      await createPage.screenshot('create_03_dataset-tab');

      await createPage.expectDatasetTabActive();
      await expect(createPage.messageTypeDropdown).toBeVisible();
      await expect(createPage.versionDropdown).toBeVisible();
      await createPage.screenshot('create_04_dropdowns-visible');
    });

    test('Select transaction type populates versions @E2E-Frontend-Only @critical', async () => {
      await createPage.goto();

      // Pick a txtp we know is allowed
      const target = await getCreateableTxtp(editorKey);
      await createPage.screenshot('create_05_before-select');

      await createPage.selectTransactionType(target.txtp);
      await createPage.waitForVersionsLoaded();
      await createPage.screenshot('create_06_versions-populated');

      // Verify the version dropdown now has options by fetching via API
      const versions = await fetchVersionsForType(editorKey, target.txtp);
      expect(
        versions.length,
        'API should return at least one version for this txtp',
      ).toBeGreaterThan(0);
    });

    test('Complete Dataset tab and go to Configure @E2E-Frontend-Only @critical', async () => {
      await createPage.goto();
      const target = await getCreateableTxtp(editorKey);
      await createPage.screenshot('create_07_filling-dataset');

      await createPage.selectTransactionType(target.txtp);
      await createPage.waitForVersionsLoaded();
      await createPage.selectVersion(target.version);
      await createPage.screenshot('create_08_dataset-filled');

      await createPage.goToConfigureTab();
      await createPage.screenshot('create_09_configure-tab');

      await configurePage.expectLoaded();
    });

    test('Configure tab shows masking fields @E2E-Frontend-Only @critical', async () => {
      // Continuing from previous test — we should already be on Configure tab
      // Re-navigate to ensure clean state
      await createPage.goto();
      const target = await getCreateableTxtp(editorKey);

      await createPage.selectTransactionType(target.txtp);
      await createPage.waitForVersionsLoaded();
      await createPage.selectVersion(target.version);
      await createPage.goToConfigureTab();

      await configurePage.screenshot('create_10_configure-fields');
      const fieldCount = await configurePage.getFieldCount();
      expect(fieldCount, 'Should have at least one masking field').toBeGreaterThan(0);
      await configurePage.screenshot('create_11_fields-visible');
    });

    test('Submit creates config successfully @E2E-Frontend-Only @critical', async () => {
      await createPage.goto();
      const target = await getCreateableTxtp(editorKey);
      await createPage.screenshot('create_12_full-flow-start');

      // Dataset tab
      await createPage.selectTransactionType(target.txtp);
      await createPage.waitForVersionsLoaded();
      await createPage.selectVersion(target.version);
      await createPage.goToConfigureTab();
      await createPage.screenshot('create_13_on-configure');

      // Configure tab — toggle at least one field
      const fieldCount = await configurePage.getFieldCount();
      if (fieldCount > 0) {
        await configurePage.toggleField(0);
      }
      await configurePage.screenshot('create_14_field-toggled');

      // Submit
      await configurePage.clickSubmit();
      await configurePage.expectSubmitModal();
      await configurePage.screenshot('create_15_submit-modal');

      await configurePage.confirmSubmit();
      await configurePage.screenshot('create_16_after-submit');

      // Should see success feedback
      await configurePage.expectSuccessToast();
      await configurePage.screenshot('create_17_success');
    });

    test('Duplicate txtp+version is rejected @E2E-Frontend-Only @regression @negative', async () => {
      // Find an existing txtp+version pair to attempt a duplicate
      const existing = await fetchExistingMaskings(editorKey);
      test.skip(existing.length === 0, 'No existing maskings to duplicate');

      const dupe = existing[0];
      await createPage.goto();
      await createPage.screenshot('create_18_duplicate-start');

      await createPage.selectTransactionType(dupe.txtp);
      await createPage.waitForVersionsLoaded();
      await createPage.selectVersion(dupe.txtp_version);
      await createPage.goToConfigureTab();

      // Toggle a field and submit
      const fieldCount = await configurePage.getFieldCount();
      if (fieldCount > 0) {
        await configurePage.toggleField(0);
      }

      await configurePage.clickSubmit();
      await configurePage.expectSubmitModal();
      await configurePage.confirmSubmit();
      await configurePage.screenshot('create_19_duplicate-submitted');

      // Should show an error (duplicate key or already exists)
      await configurePage.expectErrorToast('duplicate|already exists|conflict');
      await configurePage.screenshot('create_20_duplicate-error');
    });

    test('Empty form submission shows validation @E2E-Frontend-Only @regression @negative', async () => {
      await createPage.goto();
      await createPage.screenshot('create_21_empty-form');

      // Try to advance without selecting anything
      await createPage.goToConfigureTab();
      await createPage.screenshot('create_22_validation-shown');

      // Should show validation errors for required fields
      await createPage.expectValidationError('Transaction type is required');
      await createPage.screenshot('create_23_validation-error');
    });
  },
);

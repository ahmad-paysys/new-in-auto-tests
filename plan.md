# Playwright Test Automation Framework — Implementation Plan

## Summary
Build a production-grade Playwright test automation framework for the Rule Studio application, focused on /masking/* API endpoints. Covers API testing, E2E frontend testing, RBAC enforcement, maker-checker workflows, a custom HTML reporter, and data mutation tracking with rollback SQL generation.

---

## Tasks

### Phase 1: Project Scaffolding & Configuration
- [x] **Task 1**: Initialize project — `package.json`, install Playwright & dependencies
- [x] **Task 2**: Create `playwright.config.ts` with 3 projects (api, e2e, rbac), globalSetup, custom reporter, fullyParallel: false
- [x] **Task 3**: Create `.env.example`, `.gitignore`, `config/environments.ts`

### Phase 2: Helpers & Parsers
- [x] **Task 4**: Create `tests/helpers/swagger-parser.ts` — parse docs-json.json, auto-detect OpenAPI version, extract /masking/* endpoints
- [x] **Task 5**: Create `tests/helpers/users-loader.ts` — parse docs-users.json, provide role-based user filtering
- [x] **Task 6**: Create `tests/helpers/rbac-loader.ts` — parse config/rbac-config.json dynamically
- [x] **Task 7**: Create `tests/helpers/sql-generator.ts` — generate rollback SQL from tracked mutations

### Phase 3: Auth & Global Setup
- [x] **Task 8**: Create `tests/global.setup.ts` — login all users, save tokens to .auth/, handle per-user failures
- [x] **Task 9**: Create `tests/fixtures/auth.fixture.ts` — token management, authenticated contexts, skip on auth failure

### Phase 4: API Client & Data Tracking
- [x] **Task 10**: Create `tests/fixtures/api-client.fixture.ts` — request wrapper with auto-auth, logging, soft assertions
- [x] **Task 11**: Create `tests/fixtures/data-tracker.fixture.ts` — mutation tracking singleton

### Phase 5: Test Specs
- [x] **Task 12**: Create `tests/api/masking.api.spec.ts` — comprehensive API tests for all /masking/* endpoints
- [x] **Task 13**: Create `tests/e2e/masking.e2e.spec.ts` — frontend E2E tests for masking features
- [x] **Task 14**: Create `tests/rbac/masking.rbac.spec.ts` — RBAC permission tests
- [x] **Task 15**: Create `tests/workflows/maker-checker.spec.ts` — maker-checker lifecycle tests

### Phase 6: Custom HTML Reporter
- [x] **Task 16**: Create `reporters/custom-html-reporter.ts` — rich interactive HTML report with all features

### Phase 7: Documentation
- [x] **Task 17**: Create `README.md` with quick start, command cheat sheet, extensibility guide

---

## Phase 2 — Updates from Staging Branch Feedback

### Changes Applied
- [x] **Task U1**: Reporter output to `reports/report-{descriptor}-YYYY.MM.DD-HH.MM.SS.html` (auto-detect descriptor from project/grep)
- [x] **Task U2**: Rewrite `rbac-loader.ts` for real tier2/tier3 format (allowedCurrentStatuses, transitions)
- [x] **Task U3**: Rewrite `masking.e2e.spec.ts` — real routes (`/masking-config`, `/masking-config/action?mode=create`), real UI text, Dataset/Configure tabs, approver view
- [x] **Task U4**: Update `masking.rbac.spec.ts` — non-DE denied on `/masking-config` route, editor sees "New Configuration", approver doesn't
- [x] **Task U5**: Update `masking.api.spec.ts` — approver cannot create (403), editor cannot review (403), duplicate key constraint error
- [x] **Task U6**: Update `maker-checker.spec.ts` — re-submission after rejection, APPROVED→UNDER_REVIEW flow, removed hedging comments
- [x] **Task U7**: Update `.gitignore` (add `reports/`), `playwright.config.ts` (add html reporter), update plan.md

---

## Progress Tracking

| Task | Status | Notes |
|------|--------|-------|
| Task 1 | ✅ Done | package.json + npm install + Playwright browsers |
| Task 2 | ✅ Done | 3 projects: api, e2e, rbac; globalSetup; custom reporter |
| Task 3 | ✅ Done | .env.example, .gitignore, config/environments.ts, config/rbac-config.json |
| Task 4 | ✅ Done | Auto-detects OpenAPI 3.x vs 2.0, extracts /masking/* endpoints |
| Task 5 | ✅ Done | Role-based filtering: DE users, non-DE, editors, approvers |
| Task 6 | ✅ Done | Tier2/tier3 format: allowedCurrentStatuses, transitions, pattern matching |
| Task 7 | ✅ Done | DELETE for creations, UPDATE for modifications, ordered by FK |
| Task 8 | ✅ Done | Logs in all 4 users, per-user failure isolation |
| Task 9 | ✅ Done | Token persistence, auto-skip on auth failure, authenticated contexts |
| Task 10 | ✅ Done | Auto-auth, request/response logging, auto mutation tracking |
| Task 11 | ✅ Done | Singleton tracker, persists to JSON, summary methods |
| Task 12 | ✅ Done | Full CRUD + role enforcement (editor-only create, approver-only review) |
| Task 13 | ✅ Done | Real masking-config routes, dashboard, create flow, approver view |
| Task 14 | ✅ Done | Route-level RBAC: non-DE denied, editor/approver role differences |
| Task 15 | ✅ Done | Happy path, rejection, resubmit, APPROVED→UNDER_REVIEW, self-approval denied |
| Task 16 | ✅ Done | Report to `reports/report-{descriptor}-timestamp.html`, auto-detect descriptor |
| Task 17 | ✅ Done | Quick start, commands, extensibility, troubleshooting |

---

## Pending
- [ ] SQL rollback schema: waiting for admin-service repo from user

---

## Phase 3 — E2E-Frontend-Only: Masking Service

### Overview

A new `tests/E2E-Frontend-Only/` folder for browser-based end-to-end tests that exercise the **frontend UI only** (no direct API calls in the test body — all interactions go through the browser). Each service gets its own subfolder. We start with **Masking** (the Data Engineer workflow), tagged `@E2E-Frontend-Only`.

**Goal**: Validate every user-facing masking workflow through the real browser — login, navigation, create, edit, review, role restrictions, and full maker-checker lifecycle.

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Selector strategy | `getByRole`, `getByText`, `getByLabel` | No `data-testid` attributes exist in the frontend. Accessible selectors are resilient to CSS changes. |
| Auth approach | Inject JWT into `sessionStorage` via `page.evaluate` | Frontend reads `access_token` from sessionStorage. Matches existing `authenticatedPage` fixture pattern. |
| Page Object Model | One class per page/component | Centralizes selectors, makes spec files readable, easy to update when UI changes. |
| Screenshots | Every meaningful step | Already the project convention; aids debugging on CI. Path: `test-results/screenshots/e2e-fo/...` |
| Serial execution | `test.describe.serial` per workflow | Masking create→review flows are stateful (one test's output is the next test's input). |
| Tagging | `@E2E-Frontend-Only` on every test | Enables `--grep @E2E-Frontend-Only` for isolated runs. |

### Playwright Config Addition

Add a 4th project to `playwright.config.ts`:

```ts
{
  name: 'e2e-frontend-only',
  testMatch: /tests\/E2E-Frontend-Only\/.*\.spec\.ts/,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://10.10.80.37:5174',
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    screenshot: 'on',
    trace: 'on-first-retry',
  },
},
```

### Folder Structure

```
tests/E2E-Frontend-Only/
  page-objects/
    login.page.ts                    # Login page: email, password, submit, validation errors
    masking-dashboard.page.ts        # /masking-config: table, filters, "New Configuration" btn, view modal
    masking-create.page.ts           # /masking-config/action?mode=create: Dataset tab (txtp dropdown, version dropdown)
    masking-configure.page.ts        # Configure tab: field-level masking config, submit
    masking-view-modal.page.ts       # MaskView modal: details display, Approve/Reject buttons, comment field
  helpers/
    browser-auth.helper.ts           # Login via UI or inject token, role-specific context factories
  masking/
    masking-dashboard.spec.ts        # Dashboard rendering, table data, filters, pagination
    masking-create.spec.ts           # Create happy path, form validation, duplicate rejection
    masking-edit.spec.ts             # Edit existing config, field persistence, save
    masking-review.spec.ts           # Approver approve/reject flow via modal
    masking-rbac.spec.ts             # Role-based UI restrictions (editor vs approver vs non-DE)
    masking-maker-checker.spec.ts    # Full lifecycle: editor create → submit → approver approve
```

### Helper: `browser-auth.helper.ts`

Provides reusable browser authentication utilities:

```
- loginViaUI(page, email, password)           → fill form + click login + wait for redirect
- injectToken(page, userKey)                  → read .auth/{key}.token.json, inject into sessionStorage
- createAuthenticatedContext(browser, userKey) → newContext + page + injectToken, returns { context, page }
- createEditorPage(browser)                   → shorthand for DE editor context
- createApproverPage(browser)                 → shorthand for DE approver context
- createNonDEPage(browser)                    → shorthand for TRS editor (non-DE) context
```

### Page Objects

#### `login.page.ts`
| Element | Selector | Actions |
|---------|----------|---------|
| Email input | `getByLabel('Email Address')` | `fill(email)` |
| Password input | `getByLabel('Password')` | `fill(password)` |
| Login button | `getByRole('button', { name: /login/i })` | `click()` |
| Error message | `getByText(/invalid|error|failed/i)` | `isVisible()`, `textContent()` |
| **Methods** | | `login(email, password)`, `expectValidationErrors()`, `expectLoginError()` |

#### `masking-dashboard.page.ts`
| Element | Selector | Actions |
|---------|----------|---------|
| Page heading | `getByText(/tokenization/i)` | `isVisible()` |
| Status filter | `getByText(/status/i)` or dropdown | `selectOption()`, `click()` |
| Message type filter | `getByText(/message type/i)` or dropdown | `selectOption()`, `click()` |
| New Configuration btn | `getByRole('button', { name: /new configuration/i })` | `click()`, `isVisible()` |
| Table rows | `getByRole('row')` or `locator('tr')` | `count()`, `nth()` |
| Row action (View) | Row-level button/link | `click()` → opens MaskView modal |
| Pagination | Next/Prev buttons or page numbers | `click()` |
| **Methods** | | `goto()`, `expectLoaded()`, `getRowCount()`, `clickNewConfiguration()`, `filterByStatus(status)`, `filterByMessageType(type)`, `openRowByIndex(n)`, `expectNewConfigButtonVisible(bool)` |

#### `masking-create.page.ts`
| Element | Selector | Actions |
|---------|----------|---------|
| Dataset tab | `getByText(/dataset/i)` | `click()`, active state check |
| Configure tab | `getByText(/configure/i)` | `click()`, active state check |
| Message Type dropdown | Dropdown near "Message Type" label | `selectOption(txtp)` |
| Version dropdown | Dropdown near "Version" label | `selectOption(version)` |
| Next / Submit button | `getByRole('button', { name: /next|submit|save/i })` | `click()` |
| **Methods** | | `goto()`, `selectTransactionType(txtp)`, `selectVersion(version)`, `goToConfigureTab()`, `submitForm()`, `expectDatasetTabActive()` |

#### `masking-configure.page.ts`
| Element | Selector | Actions |
|---------|----------|---------|
| Field list | Table or list of masking field rows | `count()`, `getField(name)` |
| Field toggle/config | Per-field masking checkbox or dropdown | `toggle()`, `selectMaskType()` |
| Save / Submit button | `getByRole('button', { name: /save|submit|create/i })` | `click()` |
| Success toast | `getByText(/success|created/i)` | `isVisible()`, `waitFor()` |
| **Methods** | | `configureField(name, maskType)`, `submit()`, `expectSuccessToast()`, `expectErrorToast(msg)` |

#### `masking-view-modal.page.ts`
| Element | Selector | Actions |
|---------|----------|---------|
| Modal container | Dialog/modal role or overlay | `isVisible()`, `waitFor()` |
| Config details | Text content within modal | `textContent()` |
| Approve button | `getByRole('button', { name: /approve/i })` | `click()`, `isVisible()` |
| Reject button | `getByRole('button', { name: /reject/i })` | `click()`, `isVisible()` |
| Comment field | Textarea within modal | `fill(comment)` |
| Close button | `getByRole('button', { name: /close|cancel/i })` | `click()` |
| **Methods** | | `expectVisible()`, `approve(comment?)`, `reject(comment?)`, `close()`, `expectApproveButtonVisible(bool)`, `getDisplayedStatus()` |

### Spec Files — Detailed Test Cases

---

#### 1. `masking-dashboard.spec.ts` — Dashboard Rendering & Filters

**Precondition**: DE Editor is authenticated.

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | Dashboard loads with heading | `@E2E-Frontend-Only @smoke` | Navigate to `/masking-config`, wait for load | "Tokenization" heading visible, URL contains `/masking-config` |
| 2 | Dashboard shows table with rows | `@E2E-Frontend-Only @smoke` | Navigate to dashboard | Table is visible, row count > 0 |
| 3 | Status filter is functional | `@E2E-Frontend-Only @critical` | Open status filter, select a status | Table rows update (count may change), no error toast |
| 4 | Message type filter is functional | `@E2E-Frontend-Only @critical` | Open message type filter, select a type | Table rows update, no error toast |
| 5 | Combined filters narrow results | `@E2E-Frontend-Only @regression` | Apply status + message type filters | Row count ≤ unfiltered count |
| 6 | Pagination controls work | `@E2E-Frontend-Only @regression` | Click next page (if available) | URL or table content changes, no error |

---

#### 2. `masking-create.spec.ts` — Create Happy Path & Validation

**Precondition**: DE Editor authenticated. Uses `transaction-types-loader` to pick a fresh txtp+version.

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | Navigate to create page | `@E2E-Frontend-Only @smoke` | Click "New Configuration" on dashboard (or goto URL) | URL contains `/masking-config/action`, `mode=create` in URL or page context |
| 2 | Dataset tab shows txtp dropdown | `@E2E-Frontend-Only @critical` | On create page, verify Dataset tab is active | Message Type dropdown visible, Version dropdown visible |
| 3 | Select transaction type populates versions | `@E2E-Frontend-Only @critical` | Select a txtp from dropdown | Version dropdown gets populated (not empty) |
| 4 | Complete Dataset tab and go to Configure | `@E2E-Frontend-Only @critical` | Select txtp, select version, click Next/Configure tab | Configure tab becomes active, field list loads |
| 5 | Configure tab shows masking fields | `@E2E-Frontend-Only @critical` | On Configure tab | At least one field row visible |
| 6 | Submit creates config successfully | `@E2E-Frontend-Only @critical` | Configure fields, click Submit/Save | Success toast appears, redirected to dashboard or detail view |
| 7 | Duplicate txtp+version is rejected | `@E2E-Frontend-Only @regression @negative` | Attempt create with already-used txtp+version | Error toast/message about duplicate, form stays on page |
| 8 | Empty form submission shows validation | `@E2E-Frontend-Only @regression @negative` | Click Submit without filling anything | Validation errors appear (required fields highlighted) |

---

#### 3. `masking-edit.spec.ts` — Edit Existing Configuration

**Precondition**: DE Editor authenticated. A config in `STATUS_01_IN_PROGRESS` exists (created by create spec or pre-existing).

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | Open edit page for existing config | `@E2E-Frontend-Only @critical` | From dashboard, click edit on an IN_PROGRESS row | Edit page loads, URL contains `mode=edit` and `id=` |
| 2 | Edit page pre-fills existing data | `@E2E-Frontend-Only @critical` | On edit page | Txtp and version fields show existing values (disabled or pre-selected) |
| 3 | Modify masking fields and save | `@E2E-Frontend-Only @critical` | Change a field config, click Save | Success toast, changes persisted |
| 4 | Editor cannot edit UNDER_REVIEW config | `@E2E-Frontend-Only @regression @negative` | Navigate to edit URL for a config in STATUS_03 | Edit is blocked or fields are read-only or redirect occurs |

---

#### 4. `masking-review.spec.ts` — Approver Approve/Reject Flow

**Precondition**: DE Approver authenticated. A config in `STATUS_03_UNDER_REVIEW` exists.

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | Approver sees UNDER_REVIEW configs | `@E2E-Frontend-Only @critical` | Approver navigates to dashboard | Table shows configs with UNDER_REVIEW status |
| 2 | Open view modal for a config | `@E2E-Frontend-Only @critical` | Click view on a row | MaskView modal opens, config details visible |
| 3 | Approve button is visible to approver | `@E2E-Frontend-Only @critical` | In view modal | Approve and Reject buttons are visible |
| 4 | Approve a config | `@E2E-Frontend-Only @critical` | Click Approve (optionally add comment) | Success toast, modal closes, config status changes to APPROVED |
| 5 | Reject a config | `@E2E-Frontend-Only @critical` | Open another UNDER_REVIEW config, click Reject with comment | Success toast, config status changes to REJECTED |
| 6 | Approver cannot see IN_PROGRESS configs | `@E2E-Frontend-Only @regression` | Filter by IN_PROGRESS status (if filter allows) | No rows visible or filter option not available |

---

#### 5. `masking-rbac.spec.ts` — Role-Based UI Restrictions

**Precondition**: Multiple role contexts (DE Editor, DE Approver, TRS Editor).

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | DE Editor sees "New Configuration" | `@E2E-Frontend-Only @critical` | Editor navigates to dashboard | "New Configuration" button is visible |
| 2 | DE Approver does NOT see "New Configuration" | `@E2E-Frontend-Only @critical` | Approver navigates to dashboard | "New Configuration" button is NOT visible |
| 3 | Non-DE user cannot access masking dashboard | `@E2E-Frontend-Only @critical` | TRS Editor navigates to `/masking-config` | Redirected to `/home` (TRS landing page) |
| 4 | Non-DE user cannot access create page | `@E2E-Frontend-Only @regression` | TRS Editor navigates to `/masking-config/action?mode=create` | Redirected away from masking routes |
| 5 | DE Approver cannot access create page | `@E2E-Frontend-Only @regression` | Approver navigates to create URL directly | Redirected or create form not functional (submit blocked) |
| 6 | Editor sees correct status set in filters | `@E2E-Frontend-Only @regression` | Editor opens status filter dropdown | Options include IN_PROGRESS, UNDER_REVIEW, APPROVED, REJECTED |
| 7 | Approver sees limited status set | `@E2E-Frontend-Only @regression` | Approver opens status filter dropdown | Options limited to UNDER_REVIEW, APPROVED (per rbac-config) |

---

#### 6. `masking-maker-checker.spec.ts` — Full Lifecycle

**Precondition**: DE Editor and DE Approver both authenticated. Fresh txtp+version from `transaction-types-loader`.

| # | Test Name | Tags | Steps | Assertions |
|---|-----------|------|-------|------------|
| 1 | Editor creates new config (IN_PROGRESS) | `@E2E-Frontend-Only @critical` | Editor: create page → select txtp+version → configure → submit | Success toast, config created |
| 2 | Editor submits for review (UNDER_REVIEW) | `@E2E-Frontend-Only @critical` | Editor: on dashboard or detail, submit for review | Status changes to UNDER_REVIEW, toast confirms |
| 3 | Approver sees the submitted config | `@E2E-Frontend-Only @critical` | Approver: navigate to dashboard, find the config | Config appears in approver's table |
| 4 | Approver approves the config | `@E2E-Frontend-Only @critical` | Approver: open view modal → click Approve | Status changes to APPROVED, success toast |
| 5 | Full rejection cycle | `@E2E-Frontend-Only @critical` | Editor: create → submit. Approver: reject with comment | Config status becomes REJECTED |
| 6 | Editor re-submits after rejection | `@E2E-Frontend-Only @regression` | Editor: open rejected config → edit → re-submit for review | Status goes from REJECTED → IN_PROGRESS → UNDER_REVIEW |
| 7 | Editor cannot self-approve | `@E2E-Frontend-Only @regression @negative` | Editor: open own UNDER_REVIEW config → check for approve button | Approve/Reject buttons NOT visible to editor |

### New Helper: `fetchVersionsForType` (transaction-types-loader addition)

The UI create flow requires selecting a version from a dropdown populated by `GET /config/api/versions/{type}`. Add to `transaction-types-loader.ts`:

```
fetchVersionsForType(userKey, txtp) → string[]
  - GET /config/api/versions/{txtp}
  - Returns array of version strings available in the dropdown
  - Needed by create specs to know which version to select from the UI dropdown
```

### Implementation Order

| Step | Task | Dependencies | Status |
|------|------|-------------|--------|
| F1 | Add `e2e-frontend-only` project to `playwright.config.ts` | None | [x] |
| F2 | Create `tests/E2E-Frontend-Only/helpers/browser-auth.helper.ts` | Auth fixture exists | [x] |
| F3 | Create `tests/E2E-Frontend-Only/page-objects/login.page.ts` | None | [x] |
| F4 | Create `tests/E2E-Frontend-Only/page-objects/masking-dashboard.page.ts` | None | [x] |
| F5 | Create `tests/E2E-Frontend-Only/page-objects/masking-create.page.ts` | None | [x] |
| F6 | Create `tests/E2E-Frontend-Only/page-objects/masking-configure.page.ts` | None | [x] |
| F7 | Create `tests/E2E-Frontend-Only/page-objects/masking-view-modal.page.ts` | None | [x] |
| F8 | Add `fetchVersionsForType()` to `tests/helpers/transaction-types-loader.ts` | None | [x] |
| F9 | Create `masking/masking-dashboard.spec.ts` | F1, F2, F4 | [x] |
| F10 | Create `masking/masking-create.spec.ts` | F1, F2, F5, F6, F8 | [x] |
| F11 | Create `masking/masking-edit.spec.ts` | F1, F2, F5, F6 | [x] |
| F12 | Create `masking/masking-review.spec.ts` | F1, F2, F4, F7 | [x] |
| F13 | Create `masking/masking-rbac.spec.ts` | F1, F2, F3, F4 | [x] |
| F14 | Create `masking/masking-maker-checker.spec.ts` | F1, F2, F4, F5, F6, F7 | [x] |
| F15 | Retire `tests/e2e/masking.e2e.spec.ts` (wrap in `describe.skip`) | F9–F14 done | [x] |

### Notes

- **No `data-testid` attributes**: The frontend has zero `data-testid` attributes. All selectors use Playwright's recommended accessible locators (`getByRole`, `getByText`, `getByLabel`). If the frontend team adds `data-testid`s later, page objects are the single place to update.
- **Existing `tests/e2e/masking.e2e.spec.ts`**: RETIRED — wrapped in `test.describe.skip`, all tests skipped. Kept as reference. Superseded by 38 tests across 6 spec files in `tests/E2E-Frontend-Only/masking/`.
- **Scalability**: The same `tests/E2E-Frontend-Only/` folder will later gain `rules/`, `rule-builder/`, `simulation/`, `auth/` subfolders — each following the identical page-object + spec pattern.
- **CI tag isolation**: Run only this suite with `npx playwright test --project=e2e-frontend-only` or `npx playwright test --grep @E2E-Frontend-Only`.

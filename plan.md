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

# Rule Studio — Playwright Test Automation Framework

Production-grade test automation for the Rule Studio `/masking/*` API and frontend, covering API testing, E2E browser tests, RBAC enforcement, and maker-checker workflows.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (copy and edit .env)
cp .env.example .env
# Edit .env to set BASE_URL, FRONTEND_URL, TEST_ENV

# 3. (Optional) Provide RBAC config
# Edit config/rbac-config.json with your role→permission mapping

# 4. Run all tests
npm test

# 5. View report
npm run test:report
```

## Command Cheat Sheet

| Command | Description |
|---|---|
| `npm test` | Run all tests |
| `npm run test:smoke` | Run smoke tests only |
| `npm run test:critical` | Run smoke + critical tests |
| `npm run test:regression` | Run full regression suite |
| `npm run test:api` | Run API-only tests (no browser) |
| `npm run test:e2e` | Run E2E frontend tests |
| `npm run test:rbac` | Run RBAC permission tests |
| `npm run test:workflow` | Run maker-checker workflow tests |
| `npm run test:report` | Open HTML report |
| `npm run test:clean` | Clean generated files |

### Tag-based filtering

```bash
npx playwright test --grep @smoke
npx playwright test --grep "@smoke|@critical"
npx playwright test --grep @api
npx playwright test --grep @negative
npx playwright test --grep-invert @e2e
```

## Project Structure

```
├── tests/
│   ├── global.setup.ts            # Login all users, save tokens
│   ├── fixtures/
│   │   ├── auth.fixture.ts        # Token management, authenticated contexts
│   │   ├── api-client.fixture.ts  # API wrapper with logging & tracking
│   │   └── data-tracker.fixture.ts # Mutation tracking
│   ├── helpers/
│   │   ├── swagger-parser.ts      # Parse docs-json.json, extract endpoints
│   │   ├── users-loader.ts        # Parse docs-users.json, role filtering
│   │   ├── rbac-loader.ts         # Parse rbac-config.json
│   │   └── sql-generator.ts       # Generate rollback SQL
│   ├── api/
│   │   └── masking.api.spec.ts    # API tests for /masking/*
│   ├── e2e/
│   │   └── masking.e2e.spec.ts    # Frontend E2E tests
│   ├── rbac/
│   │   └── masking.rbac.spec.ts   # RBAC permission tests
│   └── workflows/
│       └── maker-checker.spec.ts  # Maker-checker lifecycle tests
├── config/
│   ├── rbac-config.json           # RBAC permission matrix (user-defined)
│   └── environments.ts            # Environment URL management
├── reporters/
│   └── custom-html-reporter.ts    # Rich HTML report generator
├── playwright.config.ts
├── package.json
├── .env.example
└── .gitignore
```

## How Tests Work

### Authentication
- `global.setup.ts` logs in all 4 users from `docs-users.json` **once** before tests
- Tokens are saved to `.auth/{key}.token.json`
- If a user's login fails, only that user's tests are skipped
- Zero re-authentication between tests

### Soft Failures
- ALL assertions use `expect.soft()` — tests run to completion
- All failures within a test are collected and reported together
- Only login in globalSetup uses hard assertions

### Test Order
- Create → Read → Update → Review (serial within dependency chains)
- Independent tests can run in any order

### Data Tracking
- Tests **never delete or clean up** data
- Every POST/PUT/PATCH is tracked in `test-results/data-mutations.json`
- Rollback SQL is auto-generated in the HTML report (display-only, never executed)

## Adding Tests for New Endpoint Groups

1. Create a new spec file: `tests/api/rules.api.spec.ts`
2. Update `swagger-parser.ts` filter or create a new filter function
3. Follow the same patterns: use `ApiClient`, `expect.soft()`, tags
4. No framework changes needed

## Adding New Test Users

1. Add the user to `docs-users.json`:
   ```json
   "NewUser": {
     "name": "New User",
     "email": "new@example.com",
     "role": "Publisher",
     "password": "password"
   }
   ```
2. The user will automatically be included in globalSetup login
3. Use `getUserByKey('NewUser')` in tests

## Reading the HTML Report

- **Test Results tab**: Tests grouped by file, filterable by status/tag/search
- **Data Mutations tab**: Summary dashboard + detailed mutation log + rollback SQL
- **Timing tab**: Slowest tests ranked
- Failed tests are expanded by default; passed tests are collapsed
- Click screenshots to enlarge; use dark/light mode toggle
- "Copy All Rollback SQL" button copies SQL to clipboard

## Troubleshooting

| Problem | Solution |
|---|---|
| Auth failures | Check BASE_URL in .env, verify user credentials in docs-users.json |
| Connection refused | Ensure the target application is running and accessible |
| Stale Swagger | Re-export docs-json.json from the running application |
| E2E tests fail to login | Frontend may use encrypted sessionStorage; verify VITE_CRYPTO_KEY |
| Masking UI not found | The masking frontend may not be implemented yet (API-only testing) |

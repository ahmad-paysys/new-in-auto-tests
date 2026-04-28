import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const baseURL = process.env.BASE_URL || 'http://10.10.80.37:3005';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['./reporters/custom-html-reporter.ts'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  globalSetup: require.resolve('./tests/global.setup.ts'),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'on',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts/,
      use: {
        baseURL,
      },
    },
    {
      name: 'e2e',
      testMatch: /tests\/e2e\/.*\.spec\.ts/,
      use: {
        baseURL: process.env.FRONTEND_URL || 'http://10.10.80.37:5174',
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        screenshot: 'on',
        trace: 'on-first-retry',
      },
    },
    {
      name: 'rbac',
      testMatch: /tests\/(rbac|workflows)\/.*\.spec\.ts/,
      use: {
        baseURL,
      },
    },
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
  ],
  outputDir: 'test-results',
});

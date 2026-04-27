import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import { TrackedMutation } from '../tests/fixtures/data-tracker.fixture';
import { generateRollbackSQL, formatRollbackSQL, RollbackStatement } from '../tests/helpers/sql-generator';

interface TestEntry {
  title: string;
  fullTitle: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  duration: number;
  tags: string[];
  userRole: string;
  errors: string[];
  softFailures: string[];
  annotations: { type: string; description?: string }[];
  requestLogs: RequestLogEntry[];
  screenshots: ScreenshotEntry[];
  retries: number;
}

interface RequestLogEntry {
  timestamp: string;
  method: string;
  url: string;
  requestBody: unknown;
  responseStatus: number;
  responseBody: unknown;
  responseTimeMs: number;
  userKey: string;
}

interface ScreenshotEntry {
  name: string;
  path: string;
  base64: string;
}

interface ReportData {
  timestamp: string;
  duration: number;
  environment: string;
  baseURL: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestEntry[];
  authSummary: { key: string; role: string; authenticated: boolean; error: string | null }[];
  mutations: TrackedMutation[];
  mutationSummary: {
    totalCreated: number;
    totalModified: number;
    totalModificationOps: number;
    byEndpoint: Record<string, number>;
    byTest: Record<string, number>;
    byUserRole: Record<string, number>;
  };
  rollbackSQL: string;
  rollbackStatements: RollbackStatement[];
}

function extractTags(title: string): string[] {
  const tagRegex = /@(\w+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(title)) !== null) {
    tags.push(`@${match[1]}`);
  }
  return tags;
}

function extractUserRole(title: string): string {
  const rolePatterns = ['Data Engineer Editor', 'Data Engineer Approver', 'Editor', 'Approver'];
  for (const role of rolePatterns) {
    if (title.includes(role)) return role;
  }
  return '';
}

function detectDescriptor(config: FullConfig): string {
  // Auto-detect from env override
  if (process.env.REPORT_NAME) return process.env.REPORT_NAME;

  // Auto-detect from grep filter
  const grep = config.grep;
  if (grep) {
    const grepStr = Array.isArray(grep) ? grep.map(g => g.source).join('|') : grep.source;
    if (grepStr.includes('smoke')) return 'smoke';
    if (grepStr.includes('critical')) return 'critical';
    if (grepStr.includes('regression')) return 'regression';
    if (grepStr.includes('rbac')) return 'rbac';
    if (grepStr.includes('workflow')) return 'workflow';
    if (grepStr.includes('negative')) return 'negative';
  }

  // Auto-detect from active projects
  const projects = config.projects.map(p => p.name).filter(Boolean);
  if (projects.length === 1) {
    return projects[0]; // 'api', 'e2e', or 'rbac'
  }

  return 'full';
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}-${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

class CustomHtmlReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime = 0;
  private config: FullConfig | null = null;

  onBegin(config: FullConfig, _suite: Suite) {
    this.config = config;
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const tags = extractTags(test.title);
    const parentTags = test.parent ? extractTags(test.parent.title) : [];
    const allTags = [...new Set([...tags, ...parentTags])];

    const errors: string[] = [];
    const softFailures: string[] = [];

    for (const error of result.errors) {
      const msg = error.message || error.stack || 'Unknown error';
      if (msg.includes('expect.soft')) {
        softFailures.push(msg);
      } else {
        errors.push(msg);
      }
    }

    // Collect screenshots
    const screenshots: ScreenshotEntry[] = [];
    for (const attachment of result.attachments) {
      if (attachment.contentType?.startsWith('image/') && attachment.path) {
        try {
          const imgData = fs.readFileSync(attachment.path);
          screenshots.push({
            name: attachment.name || path.basename(attachment.path),
            path: attachment.path,
            base64: imgData.toString('base64'),
          });
        } catch {
          // Skip unreadable screenshots
        }
      }
    }

    this.tests.push({
      title: test.title,
      fullTitle: test.titlePath().join(' > '),
      file: test.location.file,
      status: result.status,
      duration: result.duration,
      tags: allTags,
      userRole: extractUserRole(test.titlePath().join(' ')),
      errors,
      softFailures,
      annotations: test.annotations,
      requestLogs: [],
      screenshots,
      retries: result.retry,
    });
  }

  async onEnd(result: FullResult) {
    const duration = Date.now() - this.startTime;

    // Load request logs
    const requestLogsPath = path.resolve(process.cwd(), 'test-results', 'request-logs', 'all-requests.json');
    let requestLogs: RequestLogEntry[] = [];
    if (fs.existsSync(requestLogsPath)) {
      try {
        requestLogs = JSON.parse(fs.readFileSync(requestLogsPath, 'utf-8'));
      } catch { /* ignore */ }
    }

    // Assign request logs to tests by test name matching
    for (const test of this.tests) {
      test.requestLogs = requestLogs.filter(
        (log) =>
          test.fullTitle.includes(log.userKey) ||
          test.title.toLowerCase().includes(log.method.toLowerCase()),
      );
    }

    // Load mutations
    const mutationsPath = path.resolve(process.cwd(), 'test-results', 'data-mutations.json');
    let mutations: TrackedMutation[] = [];
    if (fs.existsSync(mutationsPath)) {
      try {
        mutations = JSON.parse(fs.readFileSync(mutationsPath, 'utf-8'));
      } catch { /* ignore */ }
    }

    // Generate rollback SQL
    const rollbackStatements = generateRollbackSQL(mutations);
    const rollbackSQL = formatRollbackSQL(rollbackStatements);

    // Mutation summary
    const successMutations = mutations.filter((m) => m.responseStatus >= 200 && m.responseStatus < 300);
    const creations = successMutations.filter((m) => m.method === 'POST');
    const modifications = successMutations.filter((m) => m.method === 'PUT' || m.method === 'PATCH');
    const modifiedIds = new Set<string>();
    for (const m of modifications) {
      const match = m.endpoint.match(/\/(\d+)(?:\/|$)/);
      if (match) modifiedIds.add(match[1]);
    }
    const byEndpoint: Record<string, number> = {};
    const byTest: Record<string, number> = {};
    const byUserRole: Record<string, number> = {};
    for (const m of mutations) {
      byEndpoint[m.endpoint] = (byEndpoint[m.endpoint] || 0) + 1;
      byTest[m.testName] = (byTest[m.testName] || 0) + 1;
      byUserRole[m.userRole] = (byUserRole[m.userRole] || 0) + 1;
    }

    // Auth summary
    let authSummary: ReportData['authSummary'] = [];
    const authSummaryPath = path.resolve(process.cwd(), '.auth', '_summary.json');
    if (fs.existsSync(authSummaryPath)) {
      try {
        const summary = JSON.parse(fs.readFileSync(authSummaryPath, 'utf-8'));
        authSummary = summary.results || [];
      } catch { /* ignore */ }
    }

    const reportData: ReportData = {
      timestamp: new Date().toISOString(),
      duration,
      environment: process.env.TEST_ENV || 'staging',
      baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
      total: this.tests.length,
      passed: this.tests.filter((t) => t.status === 'passed').length,
      failed: this.tests.filter((t) => t.status === 'failed').length,
      skipped: this.tests.filter((t) => t.status === 'skipped').length,
      tests: this.tests,
      authSummary,
      mutations,
      mutationSummary: {
        totalCreated: creations.length,
        totalModified: modifiedIds.size,
        totalModificationOps: modifications.length,
        byEndpoint,
        byTest,
        byUserRole,
      },
      rollbackSQL,
      rollbackStatements,
    };

    const html = this.generateHTML(reportData);

    const outputDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const descriptor = detectDescriptor(this.config!);
    const timestamp = formatTimestamp(new Date());
    const fileName = `report-${descriptor}-${timestamp}.html`;
    const filePath = path.join(outputDir, fileName);

    fs.writeFileSync(filePath, html);
    console.log(`\n[Reporter] HTML report saved to reports/${fileName}\n`);
  }

  private generateHTML(data: ReportData): string {
    const passRate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0';
    const durationStr = (data.duration / 1000).toFixed(1);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Report — ${data.timestamp}</title>
<style>
${this.getCSS()}
</style>
</head>
<body class="light">
<div id="app">

<!-- HEADER -->
<header class="report-header">
  <div class="header-top">
    <h1>Test Automation Report</h1>
    <div class="header-controls">
      <button onclick="toggleTheme()" id="theme-btn" title="Toggle dark/light mode">🌙</button>
      <button onclick="window.print()" title="Print report">🖨️</button>
    </div>
  </div>
  <div class="meta-row">
    <span><strong>Timestamp:</strong> ${data.timestamp}</span>
    <span><strong>Duration:</strong> ${durationStr}s</span>
    <span><strong>Environment:</strong> ${data.environment}</span>
    <span><strong>Base URL:</strong> ${data.baseURL}</span>
  </div>
  <div class="stats-bar">
    <div class="stat total"><span class="stat-num">${data.total}</span><span class="stat-label">Total</span></div>
    <div class="stat passed"><span class="stat-num">${data.passed}</span><span class="stat-label">Passed</span></div>
    <div class="stat failed"><span class="stat-num">${data.failed}</span><span class="stat-label">Failed</span></div>
    <div class="stat skipped"><span class="stat-num">${data.skipped}</span><span class="stat-label">Skipped</span></div>
    <div class="stat rate"><span class="stat-num">${passRate}%</span><span class="stat-label">Pass Rate</span></div>
  </div>
  <div class="progress-bar">
    <div class="progress-passed" style="width:${data.total > 0 ? (data.passed / data.total) * 100 : 0}%"></div>
    <div class="progress-failed" style="width:${data.total > 0 ? (data.failed / data.total) * 100 : 0}%"></div>
    <div class="progress-skipped" style="width:${data.total > 0 ? (data.skipped / data.total) * 100 : 0}%"></div>
  </div>

  <!-- Auth Summary -->
  <div class="auth-summary">
    <h3>Authentication Status</h3>
    <div class="auth-users">
      ${data.authSummary
        .map(
          (u) => `
        <span class="auth-badge ${u.authenticated ? 'auth-ok' : 'auth-fail'}">
          ${u.key} (${u.role}) ${u.authenticated ? '✓' : '✗ ' + (u.error || 'Failed')}
        </span>`,
        )
        .join('\n')}
    </div>
  </div>
</header>

<!-- TABS -->
<nav class="tabs">
  <button class="tab active" onclick="showTab('results')">Test Results</button>
  <button class="tab" onclick="showTab('mutations')">Data Mutations</button>
  <button class="tab" onclick="showTab('timing')">Timing</button>
</nav>

<!-- FILTERS -->
<div class="filters" id="filters-bar">
  <input type="text" id="search-input" placeholder="Search tests..." oninput="filterTests()">
  <select id="status-filter" onchange="filterTests()">
    <option value="all">All Status</option>
    <option value="passed">Passed</option>
    <option value="failed">Failed</option>
    <option value="skipped">Skipped</option>
  </select>
  <select id="tag-filter" onchange="filterTests()">
    <option value="all">All Tags</option>
    <option value="@smoke">@smoke</option>
    <option value="@critical">@critical</option>
    <option value="@regression">@regression</option>
    <option value="@api">@api</option>
    <option value="@e2e">@e2e</option>
    <option value="@rbac">@rbac</option>
    <option value="@negative">@negative</option>
    <option value="@workflow">@workflow</option>
  </select>
  <div class="filter-buttons">
    <button onclick="expandAll()">Expand All</button>
    <button onclick="collapseAll()">Collapse All</button>
    <button onclick="collapseSuccesses()">Collapse Successes</button>
    <button onclick="showFailuresOnly()">Failures Only</button>
    <button onclick="resetFilters()">Reset</button>
  </div>
</div>

<!-- TEST RESULTS TAB -->
<section id="tab-results" class="tab-content active">
  <div id="test-list">
    ${this.renderTests(data.tests)}
  </div>
</section>

<!-- DATA MUTATIONS TAB -->
<section id="tab-mutations" class="tab-content">
  <div class="mutations-section">
    <h2>Data Mutations Summary</h2>
    <div class="mutation-stats">
      <div class="mut-stat"><span class="mut-num">${data.mutationSummary.totalCreated}</span><span>Resources Created</span></div>
      <div class="mut-stat"><span class="mut-num">${data.mutationSummary.totalModified}</span><span>Resources Modified</span></div>
      <div class="mut-stat"><span class="mut-num">${data.mutationSummary.totalModificationOps}</span><span>Total Modifications</span></div>
    </div>

    ${Object.keys(data.mutationSummary.byEndpoint).length > 0
      ? `<h3>By Endpoint</h3>
      <table class="summary-table">
        <tr><th>Endpoint</th><th>Count</th></tr>
        ${Object.entries(data.mutationSummary.byEndpoint)
          .map(([ep, count]) => `<tr><td>${ep}</td><td>${count}</td></tr>`)
          .join('')}
      </table>`
      : '<p>No mutations recorded.</p>'}

    ${Object.keys(data.mutationSummary.byUserRole).length > 0
      ? `<h3>By User Role</h3>
      <table class="summary-table">
        <tr><th>Role</th><th>Count</th></tr>
        ${Object.entries(data.mutationSummary.byUserRole)
          .map(([role, count]) => `<tr><td>${role}</td><td>${count}</td></tr>`)
          .join('')}
      </table>`
      : ''}

    <!-- Detailed Mutation Log -->
    <h3>Mutation Log</h3>
    <div class="mutation-log">
      ${data.mutations.length > 0
        ? data.mutations
            .map(
              (m) => `
        <details class="mutation-entry">
          <summary>
            <span class="method-badge method-${m.method.toLowerCase()}">${m.method}</span>
            <span>${m.endpoint}</span>
            <span class="mut-meta">${m.userRole} | ${m.timestamp}</span>
          </summary>
          <div class="mutation-detail">
            <p><strong>Test:</strong> ${m.testName}</p>
            <p><strong>User:</strong> ${m.userKey} (${m.userRole})</p>
            <p><strong>Status:</strong> ${m.responseStatus}</p>
            ${m.requestBody ? `<div><strong>Request Body:</strong><pre>${JSON.stringify(m.requestBody, null, 2)}</pre></div>` : ''}
            ${m.responseBody ? `<div><strong>Response Body:</strong><pre>${JSON.stringify(m.responseBody, null, 2)}</pre></div>` : ''}
            ${m.beforeState ? `<div><strong>Before State:</strong><pre>${JSON.stringify(m.beforeState, null, 2)}</pre></div>` : ''}
          </div>
        </details>`,
            )
            .join('')
        : '<p>No mutations recorded during this test run.</p>'}
    </div>

    <!-- Rollback SQL -->
    <h3>Rollback SQL</h3>
    <div class="rollback-warning">
      ⚠️ WARNING: These SQL statements are for MANUAL execution only. Review carefully before running. The test framework will NEVER execute these automatically.
    </div>
    <div class="rollback-sql">
      <button onclick="copyRollbackSQL()" class="copy-btn">📋 Copy All Rollback SQL</button>
      <pre id="rollback-sql-content">${this.escapeHtml(data.rollbackSQL)}</pre>
    </div>
  </div>
</section>

<!-- TIMING TAB -->
<section id="tab-timing" class="tab-content">
  <h2>Timing Analysis</h2>
  <h3>Slowest Tests</h3>
  <table class="summary-table">
    <tr><th>#</th><th>Test</th><th>Duration</th><th>Status</th></tr>
    ${[...data.tests]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 20)
      .map(
        (t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${this.escapeHtml(t.title)}</td>
        <td>${(t.duration / 1000).toFixed(2)}s</td>
        <td><span class="status-badge status-${t.status}">${t.status}</span></td>
      </tr>`,
      )
      .join('')}
  </table>
</section>

</div>

<script>
${this.getJS()}
</script>
</body>
</html>`;
  }

  private renderTests(tests: TestEntry[]): string {
    // Group by file
    const groups: Record<string, TestEntry[]> = {};
    for (const t of tests) {
      const file = path.basename(t.file);
      if (!groups[file]) groups[file] = [];
      groups[file].push(t);
    }

    let html = '';
    for (const [file, fileTests] of Object.entries(groups)) {
      const filePassed = fileTests.filter((t) => t.status === 'passed').length;
      const fileFailed = fileTests.filter((t) => t.status === 'failed').length;
      const fileSkipped = fileTests.filter((t) => t.status === 'skipped').length;

      html += `
      <div class="test-group" data-file="${this.escapeHtml(file)}">
        <div class="group-header" onclick="toggleGroup(this)">
          <span class="group-arrow">▼</span>
          <span class="group-name">${this.escapeHtml(file)}</span>
          <span class="group-stats">
            <span class="badge-sm passed">${filePassed}</span>
            <span class="badge-sm failed">${fileFailed}</span>
            <span class="badge-sm skipped">${fileSkipped}</span>
          </span>
        </div>
        <div class="group-body">`;

      for (const t of fileTests) {
        const isExpanded = t.status === 'failed';
        const tagsHtml = t.tags.map((tag) => `<span class="tag">${tag}</span>`).join(' ');
        const errorsHtml = [...t.errors, ...t.softFailures]
          .map((e) => `<div class="error-msg"><pre>${this.escapeHtml(e)}</pre></div>`)
          .join('');
        const screenshotsHtml = t.screenshots
          .map(
            (s) =>
              `<div class="screenshot"><img src="data:image/png;base64,${s.base64}" alt="${this.escapeHtml(s.name)}" loading="lazy"><span class="screenshot-label">${this.escapeHtml(s.name)}</span></div>`,
          )
          .join('');
        const requestLogsHtml = t.requestLogs
          .map(
            (r) => `
          <div class="request-log">
            <div class="req-header">
              <span class="method-badge method-${r.method.toLowerCase()}">${r.method}</span>
              <span class="req-url">${this.escapeHtml(r.url)}</span>
              <span class="status-code status-${r.responseStatus < 300 ? 'ok' : r.responseStatus < 500 ? 'warn' : 'err'}">${r.responseStatus}</span>
              <span class="req-time">${r.responseTimeMs}ms</span>
            </div>
            ${r.requestBody ? `<details><summary>Request Body</summary><pre>${this.escapeHtml(JSON.stringify(r.requestBody, null, 2))}</pre></details>` : ''}
            ${r.responseBody ? `<details><summary>Response Body</summary><pre>${this.escapeHtml(JSON.stringify(r.responseBody, null, 2))}</pre></details>` : ''}
          </div>`,
          )
          .join('');

        html += `
        <details class="test-entry test-${t.status}" data-status="${t.status}" data-tags="${t.tags.join(' ')}" ${isExpanded ? 'open' : ''}>
          <summary class="test-summary">
            <span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span>
            <span class="test-title">${this.escapeHtml(t.title)}</span>
            <span class="test-tags">${tagsHtml}</span>
            <span class="test-duration">${(t.duration / 1000).toFixed(2)}s</span>
          </summary>
          <div class="test-details">
            ${errorsHtml ? `<div class="errors-section"><h4>Failures</h4>${errorsHtml}</div>` : ''}
            ${t.annotations.length > 0 ? `<div class="annotations">${t.annotations.map((a) => `<span class="annotation">${a.type}: ${a.description || ''}</span>`).join('')}</div>` : ''}
            ${requestLogsHtml ? `<div class="requests-section"><h4>Request/Response Logs</h4>${requestLogsHtml}</div>` : ''}
            ${screenshotsHtml ? `<div class="screenshots-section"><h4>Screenshots</h4><div class="screenshot-gallery">${screenshotsHtml}</div></div>` : ''}
          </div>
        </details>`;
      }

      html += `</div></div>`;
    }

    return html;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getCSS(): string {
    return `
:root{--bg:#fff;--text:#1a1a2e;--card:#f8f9fa;--border:#e0e0e0;--pass:#28a745;--fail:#dc3545;--skip:#ffc107;--accent:#0d6efd;--header-bg:#1a1a2e;--code-bg:#f5f5f5}
.dark{--bg:#1a1a2e;--text:#e0e0e0;--card:#16213e;--border:#2a2a4a;--header-bg:#0f3460;--code-bg:#0a0a1a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
#app{max-width:1400px;margin:0 auto;padding:16px}
.report-header{background:var(--header-bg);color:#fff;padding:24px;border-radius:8px;margin-bottom:16px}
.header-top{display:flex;justify-content:space-between;align-items:center}
.header-top h1{font-size:1.5rem}
.header-controls button{background:none;border:1px solid rgba(255,255,255,.3);color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;margin-left:8px;font-size:1rem}
.meta-row{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0;font-size:.875rem;opacity:.9}
.stats-bar{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}
.stat{text-align:center;padding:8px 16px;border-radius:6px;background:rgba(255,255,255,.1);min-width:80px}
.stat-num{display:block;font-size:1.5rem;font-weight:700}
.stat-label{font-size:.75rem;opacity:.8}
.stat.passed{border-left:3px solid var(--pass)}.stat.failed{border-left:3px solid var(--fail)}.stat.skipped{border-left:3px solid var(--skip)}
.progress-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.1);display:flex;overflow:hidden}
.progress-passed{background:var(--pass)}.progress-failed{background:var(--fail)}.progress-skipped{background:var(--skip)}
.auth-summary{margin-top:16px}.auth-summary h3{font-size:.9rem;margin-bottom:8px}
.auth-users{display:flex;gap:8px;flex-wrap:wrap}
.auth-badge{padding:4px 10px;border-radius:12px;font-size:.8rem}
.auth-ok{background:rgba(40,167,69,.2);color:#28a745}.auth-fail{background:rgba(220,53,69,.2);color:#dc3545}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0}
.tab{padding:8px 20px;border:none;background:transparent;color:var(--text);cursor:pointer;font-size:.9rem;border-bottom:2px solid transparent;margin-bottom:-2px}
.tab.active{border-bottom-color:var(--accent);color:var(--accent);font-weight:600}
.tab-content{display:none}.tab-content.active{display:block}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:var(--card);border-radius:6px;border:1px solid var(--border)}
.filters input,.filters select{padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:.85rem}
.filters input{flex:1;min-width:200px}
.filter-buttons{display:flex;gap:4px;flex-wrap:wrap}
.filter-buttons button{padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);cursor:pointer;font-size:.8rem}
.filter-buttons button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.test-group{margin-bottom:8px;border:1px solid var(--border);border-radius:6px;overflow:hidden}
.group-header{padding:10px 16px;background:var(--card);cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:600;font-size:.9rem}
.group-arrow{font-size:.7rem;transition:transform .2s}.group-header.collapsed .group-arrow{transform:rotate(-90deg)}
.group-stats{margin-left:auto;display:flex;gap:4px}
.badge-sm{padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600;color:#fff}
.badge-sm.passed{background:var(--pass)}.badge-sm.failed{background:var(--fail)}.badge-sm.skipped{background:var(--skip)}
.group-body{padding:4px}
.test-entry{border:1px solid var(--border);border-radius:4px;margin:4px 0;overflow:hidden}
.test-summary{padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:.85rem;list-style:none}
.test-summary::-webkit-details-marker{display:none}
.status-badge{padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700;color:#fff;text-transform:uppercase;min-width:60px;text-align:center;display:inline-block}
.status-passed{background:var(--pass)}.status-failed{background:var(--fail)}.status-skipped{background:var(--skip)}.status-timedOut{background:#fd7e14}.status-interrupted{background:#6c757d}
.test-title{flex:1}.test-duration{color:var(--text);opacity:.6;font-size:.8rem;white-space:nowrap}
.test-tags{display:flex;gap:3px;flex-wrap:wrap}
.tag{background:var(--accent);color:#fff;padding:1px 6px;border-radius:8px;font-size:.7rem}
.test-details{padding:12px;border-top:1px solid var(--border);background:var(--card)}
.errors-section{margin-bottom:12px}
.error-msg{background:rgba(220,53,69,.1);border-left:3px solid var(--fail);padding:8px;margin:4px 0;border-radius:0 4px 4px 0}
.error-msg pre{white-space:pre-wrap;word-break:break-all;font-size:.8rem;max-height:300px;overflow-y:auto}
.annotations{margin-bottom:8px}.annotation{background:rgba(108,117,125,.15);padding:2px 8px;border-radius:4px;font-size:.8rem;margin-right:4px}
.requests-section,.screenshots-section{margin-top:12px}
.requests-section h4,.screenshots-section h4,.errors-section h4{font-size:.85rem;margin-bottom:8px}
.request-log{border:1px solid var(--border);border-radius:4px;margin:4px 0;overflow:hidden}
.req-header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);font-size:.8rem}
.method-badge{padding:2px 6px;border-radius:3px;font-weight:700;font-size:.7rem;color:#fff}
.method-get{background:#28a745}.method-post{background:#0d6efd}.method-put{background:#fd7e14}.method-patch{background:#6f42c1}.method-delete{background:#dc3545}
.req-url{flex:1;word-break:break-all}
.status-code{padding:2px 8px;border-radius:10px;font-weight:700;font-size:.75rem;color:#fff}
.status-ok{background:#28a745}.status-warn{background:#ffc107;color:#000}.status-err{background:#dc3545}
.req-time{opacity:.6;font-size:.75rem}
.request-log details{padding:6px 10px}
.request-log pre{background:var(--code-bg);padding:8px;border-radius:4px;font-size:.8rem;overflow-x:auto;max-height:200px;overflow-y:auto}
.screenshot-gallery{display:flex;gap:8px;flex-wrap:wrap}
.screenshot{text-align:center;max-width:250px}
.screenshot img{max-width:100%;border:1px solid var(--border);border-radius:4px;cursor:pointer}
.screenshot-label{display:block;font-size:.7rem;margin-top:2px;opacity:.7}
.mutations-section{padding:8px}
.mutation-stats{display:flex;gap:16px;margin:16px 0}
.mut-stat{text-align:center;padding:12px 24px;border-radius:6px;background:var(--card);border:1px solid var(--border)}
.mut-num{display:block;font-size:1.5rem;font-weight:700;color:var(--accent)}
.summary-table{width:100%;border-collapse:collapse;margin:8px 0}
.summary-table th,.summary-table td{padding:6px 12px;border:1px solid var(--border);text-align:left;font-size:.85rem}
.summary-table th{background:var(--card);font-weight:600}
.mutation-entry{border:1px solid var(--border);border-radius:4px;margin:4px 0}
.mutation-entry summary{padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:.85rem}
.mutation-detail{padding:12px;background:var(--card)}
.mutation-detail pre{background:var(--code-bg);padding:8px;border-radius:4px;font-size:.8rem;overflow-x:auto;max-height:200px;overflow-y:auto}
.mut-meta{margin-left:auto;opacity:.6;font-size:.75rem}
.rollback-warning{background:rgba(255,193,7,.15);border:1px solid #ffc107;padding:12px;border-radius:6px;margin:12px 0;font-weight:600}
.rollback-sql{position:relative;margin-top:8px}
.copy-btn{padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.85rem;margin-bottom:8px}
.rollback-sql pre{background:var(--code-bg);padding:12px;border-radius:4px;font-size:.8rem;overflow-x:auto;max-height:400px;overflow-y:auto;border:1px solid var(--border)}
@media print{.tabs,.filters,.header-controls,.filter-buttons,.copy-btn{display:none!important}.test-entry,.mutation-entry{break-inside:avoid}}
@media(max-width:768px){.stats-bar,.mutation-stats{flex-direction:column}.meta-row{flex-direction:column;gap:4px}.filters{flex-direction:column}}
`;
  }

  private getJS(): string {
    return `
function showTab(name){
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  event.target.classList.add('active');
  document.getElementById('filters-bar').style.display=name==='results'?'flex':'none';
}
function toggleTheme(){
  const body=document.body;
  body.classList.toggle('dark');body.classList.toggle('light');
  document.getElementById('theme-btn').textContent=body.classList.contains('dark')?'☀️':'🌙';
}
function toggleGroup(el){
  el.classList.toggle('collapsed');
  el.nextElementSibling.style.display=el.classList.contains('collapsed')?'none':'block';
}
function filterTests(){
  const search=document.getElementById('search-input').value.toLowerCase();
  const status=document.getElementById('status-filter').value;
  const tag=document.getElementById('tag-filter').value;
  document.querySelectorAll('.test-entry').forEach(el=>{
    const title=el.querySelector('.test-title')?.textContent?.toLowerCase()||'';
    const elStatus=el.dataset.status;
    const elTags=el.dataset.tags||'';
    const matchSearch=!search||title.includes(search);
    const matchStatus=status==='all'||elStatus===status;
    const matchTag=tag==='all'||elTags.includes(tag);
    el.style.display=matchSearch&&matchStatus&&matchTag?'':'none';
  });
}
function expandAll(){document.querySelectorAll('.test-entry').forEach(el=>el.open=true)}
function collapseAll(){document.querySelectorAll('.test-entry').forEach(el=>el.open=false)}
function collapseSuccesses(){document.querySelectorAll('.test-entry').forEach(el=>{el.open=el.dataset.status==='failed'})}
function showFailuresOnly(){
  document.getElementById('status-filter').value='failed';filterTests();
}
function resetFilters(){
  document.getElementById('search-input').value='';
  document.getElementById('status-filter').value='all';
  document.getElementById('tag-filter').value='all';
  document.querySelectorAll('.test-entry').forEach(el=>el.style.display='');
}
function copyRollbackSQL(){
  const sql=document.getElementById('rollback-sql-content').textContent;
  navigator.clipboard.writeText(sql).then(()=>alert('Rollback SQL copied to clipboard!')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=sql;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('Copied!');
  });
}
// Screenshot modal
document.addEventListener('click',e=>{
  if(e.target.tagName==='IMG'&&e.target.closest('.screenshot')){
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer';
    const img=document.createElement('img');
    img.src=e.target.src;img.style.cssText='max-width:90vw;max-height:90vh;border-radius:8px';
    overlay.appendChild(img);overlay.onclick=()=>overlay.remove();
    document.body.appendChild(overlay);
  }
});
`;
  }
}

export default CustomHtmlReporter;

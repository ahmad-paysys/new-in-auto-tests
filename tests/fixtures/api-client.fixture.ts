import { APIRequestContext, APIResponse } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getTokenForUser, isUserAuthenticated } from './auth.fixture';
import { dataTracker } from './data-tracker.fixture';

export interface RequestLog {
  timestamp: string;
  testName: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  responseTimeMs: number;
  userKey: string;
}

const requestLogs: RequestLog[] = [];

function persistLogs(): void {
  const dir = path.resolve(process.cwd(), 'test-results', 'request-logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'all-requests.json'), JSON.stringify(requestLogs, null, 2));
}

function maskAuthHeader(headers: Record<string, string>): Record<string, string> {
  const masked = { ...headers };
  if (masked['Authorization'] || masked['authorization']) {
    const key = masked['Authorization'] ? 'Authorization' : 'authorization';
    const val = masked[key];
    if (val.length > 20) {
      masked[key] = val.substring(0, 15) + '...[MASKED]';
    }
  }
  return masked;
}

export interface ApiClientOptions {
  userKey: string;
  baseURL?: string;
  testName?: string;
}

export class ApiClient {
  private userKey: string;
  private baseURL: string;
  private testName: string;
  private context: APIRequestContext | null = null;

  constructor(options: ApiClientOptions) {
    this.userKey = options.userKey;
    this.baseURL = options.baseURL || process.env.BASE_URL || 'http://10.10.80.37:3005';
    this.testName = options.testName || 'unknown';
  }

  private async getContext(): Promise<APIRequestContext> {
    if (this.context) return this.context;

    const token = getTokenForUser(this.userKey);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.context = await pwRequest.newContext({
      baseURL: this.baseURL,
      extraHTTPHeaders: headers,
    });

    return this.context;
  }

  private async logRequest(
    method: string,
    url: string,
    requestBody: unknown,
    response: APIResponse,
    startTime: number,
  ): Promise<RequestLog> {
    const responseBody = await response.json().catch(() => response.text().catch(() => null));
    const log: RequestLog = {
      timestamp: new Date().toISOString(),
      testName: this.testName,
      method,
      url: `${this.baseURL}${url}`,
      requestHeaders: maskAuthHeader({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getTokenForUser(this.userKey) || 'none'}`,
      }),
      requestBody,
      responseStatus: response.status(),
      responseHeaders: response.headers(),
      responseBody,
      responseTimeMs: Date.now() - startTime,
      userKey: this.userKey,
    };
    requestLogs.push(log);
    persistLogs();
    return log;
  }

  async get(urlPath: string, params?: Record<string, string | number>): Promise<{ status: number; body: any; headers: Record<string, string>; log: RequestLog }> {
    const ctx = await this.getContext();
    let fullPath = urlPath;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        searchParams.set(k, String(v));
      }
      fullPath = `${urlPath}?${searchParams.toString()}`;
    }
    const start = Date.now();
    const response = await ctx.get(fullPath);
    const log = await this.logRequest('GET', fullPath, null, response, start);
    return {
      status: response.status(),
      body: log.responseBody,
      headers: response.headers(),
      log,
    };
  }

  async post(urlPath: string, body?: unknown, params?: Record<string, string | number>): Promise<{ status: number; body: any; headers: Record<string, string>; log: RequestLog }> {
    const ctx = await this.getContext();
    let fullPath = urlPath;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        searchParams.set(k, String(v));
      }
      fullPath = `${urlPath}?${searchParams.toString()}`;
    }
    const start = Date.now();
    const response = await ctx.post(fullPath, { data: body });
    const log = await this.logRequest('POST', fullPath, body, response, start);

    // Track creation if successful
    if (response.status() >= 200 && response.status() < 300) {
      const tokenData = this.getTokenData();
      dataTracker.trackCreation({
        testName: this.testName,
        endpoint: urlPath,
        userKey: this.userKey,
        userRole: tokenData?.role || 'unknown',
        requestBody: body,
        responseBody: log.responseBody,
        responseStatus: response.status(),
      });
    }

    return {
      status: response.status(),
      body: log.responseBody,
      headers: response.headers(),
      log,
    };
  }

  async put(urlPath: string, body?: unknown): Promise<{ status: number; body: any; headers: Record<string, string>; log: RequestLog }> {
    const ctx = await this.getContext();

    // GET before state for tracking
    let beforeState: unknown = null;
    try {
      const beforeResp = await ctx.get(urlPath);
      if (beforeResp.status() === 200) {
        beforeState = await beforeResp.json().catch(() => null);
      }
    } catch {
      // Ignore — before state is best effort
    }

    const start = Date.now();
    const response = await ctx.put(urlPath, { data: body });
    const log = await this.logRequest('PUT', urlPath, body, response, start);

    if (response.status() >= 200 && response.status() < 300) {
      const tokenData = this.getTokenData();
      dataTracker.trackModification({
        testName: this.testName,
        method: 'PUT',
        endpoint: urlPath,
        userKey: this.userKey,
        userRole: tokenData?.role || 'unknown',
        requestBody: body,
        responseBody: log.responseBody,
        responseStatus: response.status(),
        beforeState,
      });
    }

    return {
      status: response.status(),
      body: log.responseBody,
      headers: response.headers(),
      log,
    };
  }

  async patch(urlPath: string, body?: unknown): Promise<{ status: number; body: any; headers: Record<string, string>; log: RequestLog }> {
    const ctx = await this.getContext();

    // GET before state — try stripping any trailing action from path
    let beforeState: unknown = null;
    const basePath = urlPath.replace(/\/review$/, '');
    try {
      const beforeResp = await ctx.get(basePath);
      if (beforeResp.status() === 200) {
        beforeState = await beforeResp.json().catch(() => null);
      }
    } catch {
      // Ignore
    }

    const start = Date.now();
    const response = await ctx.patch(urlPath, { data: body });
    const log = await this.logRequest('PATCH', urlPath, body, response, start);

    if (response.status() >= 200 && response.status() < 300) {
      const tokenData = this.getTokenData();
      dataTracker.trackModification({
        testName: this.testName,
        method: 'PATCH',
        endpoint: urlPath,
        userKey: this.userKey,
        userRole: tokenData?.role || 'unknown',
        requestBody: body,
        responseBody: log.responseBody,
        responseStatus: response.status(),
        beforeState,
      });
    }

    return {
      status: response.status(),
      body: log.responseBody,
      headers: response.headers(),
      log,
    };
  }

  async delete(urlPath: string): Promise<{ status: number; body: any; headers: Record<string, string>; log: RequestLog }> {
    const ctx = await this.getContext();

    let beforeState: unknown = null;
    try {
      const beforeResp = await ctx.get(urlPath);
      if (beforeResp.status() === 200) {
        beforeState = await beforeResp.json().catch(() => null);
      }
    } catch {
      // Ignore
    }

    const start = Date.now();
    const response = await ctx.delete(urlPath);
    const log = await this.logRequest('DELETE', urlPath, null, response, start);

    if (response.status() >= 200 && response.status() < 300) {
      const tokenData = this.getTokenData();
      dataTracker.trackDeletion({
        testName: this.testName,
        endpoint: urlPath,
        userKey: this.userKey,
        userRole: tokenData?.role || 'unknown',
        requestBody: null,
        responseBody: log.responseBody,
        responseStatus: response.status(),
        beforeState,
      });
    }

    return {
      status: response.status(),
      body: log.responseBody,
      headers: response.headers(),
      log,
    };
  }

  private getTokenData(): { role: string } | null {
    try {
      const tokenPath = path.resolve(process.cwd(), '.auth', `${this.userKey}.token.json`);
      if (fs.existsSync(tokenPath)) {
        return JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      }
    } catch {
      // Ignore
    }
    return null;
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.dispose();
      this.context = null;
    }
  }
}

export function getRequestLogs(): RequestLog[] {
  return [...requestLogs];
}

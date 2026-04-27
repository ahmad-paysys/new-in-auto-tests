import fs from 'fs';
import path from 'path';

export interface TrackedMutation {
  id: string;
  testName: string;
  timestamp: string;
  method: string;
  endpoint: string;
  userKey: string;
  userRole: string;
  requestBody: unknown;
  responseBody: unknown;
  responseStatus: number;
  beforeState: unknown;
}

export interface MutationSummary {
  totalCreated: number;
  totalModified: number;
  totalModificationOps: number;
  byEndpoint: Record<string, number>;
  byTest: Record<string, number>;
  byUserRole: Record<string, number>;
}

class DataTrackerSingleton {
  private mutations: TrackedMutation[] = [];
  private outputPath: string;

  constructor() {
    this.outputPath = path.resolve(process.cwd(), 'test-results', 'data-mutations.json');
  }

  private persist(): void {
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.outputPath, JSON.stringify(this.mutations, null, 2));
  }

  private generateId(): string {
    return `mut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  trackCreation(params: {
    testName: string;
    endpoint: string;
    userKey: string;
    userRole: string;
    requestBody: unknown;
    responseBody: unknown;
    responseStatus: number;
  }): void {
    this.mutations.push({
      id: this.generateId(),
      testName: params.testName,
      timestamp: new Date().toISOString(),
      method: 'POST',
      endpoint: params.endpoint,
      userKey: params.userKey,
      userRole: params.userRole,
      requestBody: params.requestBody,
      responseBody: params.responseBody,
      responseStatus: params.responseStatus,
      beforeState: null,
    });
    this.persist();
  }

  trackModification(params: {
    testName: string;
    method: 'PUT' | 'PATCH';
    endpoint: string;
    userKey: string;
    userRole: string;
    requestBody: unknown;
    responseBody: unknown;
    responseStatus: number;
    beforeState: unknown;
  }): void {
    this.mutations.push({
      id: this.generateId(),
      testName: params.testName,
      timestamp: new Date().toISOString(),
      method: params.method,
      endpoint: params.endpoint,
      userKey: params.userKey,
      userRole: params.userRole,
      requestBody: params.requestBody,
      responseBody: params.responseBody,
      responseStatus: params.responseStatus,
      beforeState: params.beforeState,
    });
    this.persist();
  }

  trackDeletion(params: {
    testName: string;
    endpoint: string;
    userKey: string;
    userRole: string;
    requestBody: unknown;
    responseBody: unknown;
    responseStatus: number;
    beforeState: unknown;
  }): void {
    this.mutations.push({
      id: this.generateId(),
      testName: params.testName,
      timestamp: new Date().toISOString(),
      method: 'DELETE',
      endpoint: params.endpoint,
      userKey: params.userKey,
      userRole: params.userRole,
      requestBody: params.requestBody,
      responseBody: params.responseBody,
      responseStatus: params.responseStatus,
      beforeState: params.beforeState,
    });
    this.persist();
  }

  getMutations(): TrackedMutation[] {
    return [...this.mutations];
  }

  getSummary(): MutationSummary {
    const creations = this.mutations.filter((m) => m.method === 'POST' && m.responseStatus >= 200 && m.responseStatus < 300);
    const modifications = this.mutations.filter(
      (m) => (m.method === 'PUT' || m.method === 'PATCH') && m.responseStatus >= 200 && m.responseStatus < 300,
    );

    const byEndpoint: Record<string, number> = {};
    const byTest: Record<string, number> = {};
    const byUserRole: Record<string, number> = {};

    for (const m of this.mutations) {
      byEndpoint[m.endpoint] = (byEndpoint[m.endpoint] || 0) + 1;
      byTest[m.testName] = (byTest[m.testName] || 0) + 1;
      byUserRole[m.userRole] = (byUserRole[m.userRole] || 0) + 1;
    }

    // Count unique modified resource IDs
    const modifiedIds = new Set<string>();
    for (const m of modifications) {
      const match = m.endpoint.match(/\/(\d+)(?:\/|$)/);
      if (match) modifiedIds.add(match[1]);
    }

    return {
      totalCreated: creations.length,
      totalModified: modifiedIds.size,
      totalModificationOps: modifications.length,
      byEndpoint,
      byTest,
      byUserRole,
    };
  }

  clear(): void {
    this.mutations = [];
    if (fs.existsSync(this.outputPath)) {
      fs.unlinkSync(this.outputPath);
    }
  }
}

// Global singleton
export const dataTracker = new DataTrackerSingleton();

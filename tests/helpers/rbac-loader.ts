import fs from 'fs';
import path from 'path';

export interface Tier2RolePermission {
  allowedCurrentStatuses: string[];
}

export interface Tier2 {
  description?: string;
  rolePermissions: Record<string, Tier2RolePermission>;
}

export interface Tier3 {
  description?: string;
  transitions: Record<string, Record<string, string[]>>;
}

export interface EndpointRbac {
  tier2?: Tier2;
  tier3?: Tier3;
}

export interface RbacConfig {
  _comment?: string;
  endpoints: Record<string, EndpointRbac>;
}

let cachedConfig: RbacConfig | null = null;

function loadConfig(filePath?: string): RbacConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = filePath || path.resolve(process.cwd(), 'config', 'rbac-config.json');
  if (!fs.existsSync(configPath)) {
    cachedConfig = { endpoints: {} };
    return cachedConfig;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(raw) as RbacConfig;
  return cachedConfig;
}

function normalizeKey(method: string, endpointPath: string): string {
  return `${method.toUpperCase()} ${endpointPath}`;
}

function matchEndpoint(key: string, config: RbacConfig): EndpointRbac | null {
  // Exact match
  if (config.endpoints[key]) return config.endpoints[key];

  // Pattern match: normalize {id} and :id to a common form
  const normalize = (s: string) => s.replace(/:\w+/g, '{param}').replace(/\{[^}]+\}/g, '{param}');
  const normalizedKey = normalize(key);
  for (const [pattern, rbac] of Object.entries(config.endpoints)) {
    if (normalize(pattern) === normalizedKey) return rbac;
  }

  return null;
}

export function getEndpointRbac(
  method: string,
  endpointPath: string,
  filePath?: string,
): EndpointRbac | null {
  const config = loadConfig(filePath);
  return matchEndpoint(normalizeKey(method, endpointPath), config);
}

export function getAllowedStatuses(
  role: string,
  method: string,
  endpointPath: string,
  filePath?: string,
): string[] {
  const rbac = getEndpointRbac(method, endpointPath, filePath);
  if (!rbac?.tier2?.rolePermissions) return [];
  const rolePerm = rbac.tier2.rolePermissions[role];
  return rolePerm?.allowedCurrentStatuses || [];
}

export function isRoleAllowedTier2(
  role: string,
  method: string,
  endpointPath: string,
  currentStatus: string,
  filePath?: string,
): boolean {
  const statuses = getAllowedStatuses(role, method, endpointPath, filePath);
  if (statuses.length === 0) return false;
  return statuses.includes(currentStatus);
}

export function getAllowedTransitions(
  role: string,
  method: string,
  endpointPath: string,
  currentStatus: string,
  filePath?: string,
): string[] {
  const rbac = getEndpointRbac(method, endpointPath, filePath);
  if (!rbac?.tier3?.transitions) return [];
  const roleTransitions = rbac.tier3.transitions[role];
  if (!roleTransitions) return [];
  return roleTransitions[currentStatus] || [];
}

export function canTransition(
  role: string,
  method: string,
  endpointPath: string,
  currentStatus: string,
  targetStatus: string,
  filePath?: string,
): boolean {
  const allowed = getAllowedTransitions(role, method, endpointPath, currentStatus, filePath);
  return allowed.includes(targetStatus);
}

export function getRolesWithAccess(
  method: string,
  endpointPath: string,
  filePath?: string,
): string[] {
  const rbac = getEndpointRbac(method, endpointPath, filePath);
  if (!rbac?.tier2?.rolePermissions) return [];
  return Object.keys(rbac.tier2.rolePermissions);
}

export function reloadConfig(): void {
  cachedConfig = null;
}

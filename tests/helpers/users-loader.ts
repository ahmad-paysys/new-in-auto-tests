import fs from 'fs';
import path from 'path';

export interface TestUser {
  key: string;
  name: string;
  email: string;
  role: string;
  password: string;
}

let cachedUsers: TestUser[] | null = null;

function loadUsers(filePath?: string): TestUser[] {
  if (cachedUsers) return cachedUsers;

  const docPath = filePath || path.resolve(process.cwd(), 'docs-users.json');
  const raw = fs.readFileSync(docPath, 'utf-8');
  const data = JSON.parse(raw);

  cachedUsers = Object.entries(data).map(([key, value]) => {
    const user = value as Record<string, string>;
    return {
      key,
      name: user.name,
      email: user.email,
      role: user.role,
      password: user.password,
    };
  });

  return cachedUsers;
}

export function getAllUsers(filePath?: string): TestUser[] {
  return loadUsers(filePath);
}

export function getDataEngineerUsers(filePath?: string): TestUser[] {
  return loadUsers(filePath).filter((u) => u.role.includes('data_engineer'));
}

export function getNonDataEngineerUsers(filePath?: string): TestUser[] {
  return loadUsers(filePath).filter((u) => !u.role.includes('data_engineer'));
}

export function getEditors(filePath?: string): TestUser[] {
  return loadUsers(filePath).filter((u) => u.role.includes('editor'));
}

export function getApprovers(filePath?: string): TestUser[] {
  return loadUsers(filePath).filter((u) => u.role.includes('approver'));
}

export function getDataEngineerEditor(filePath?: string): TestUser | undefined {
  return loadUsers(filePath).find((u) => u.role === 'trs_data_engineer_editor');
}

export function getDataEngineerApprover(filePath?: string): TestUser | undefined {
  return loadUsers(filePath).find((u) => u.role === 'trs_data_engineer_approver');
}

export function getUserByKey(key: string, filePath?: string): TestUser | undefined {
  return loadUsers(filePath).find((u) => u.key === key);
}

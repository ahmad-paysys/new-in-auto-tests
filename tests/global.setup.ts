import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { getAllUsers } from './helpers/users-loader';
import { getLoginEndpoint, getBaseURL } from './helpers/swagger-parser';

interface AuthResult {
  key: string;
  name: string;
  email: string;
  role: string;
  token: string | null;
  error: string | null;
}

async function globalSetup() {
  const authDir = path.resolve(process.cwd(), '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const users = getAllUsers();
  const loginEndpoint = getLoginEndpoint();
  const baseURL = process.env.BASE_URL || getBaseURL();

  console.log(`\n[Global Setup] Authenticating ${users.length} users against ${baseURL}${loginEndpoint.path}`);

  const results: AuthResult[] = [];

  const apiContext = await request.newContext({ baseURL });

  for (const user of users) {
    const result: AuthResult = {
      key: user.key,
      name: user.name,
      email: user.email,
      role: user.role,
      token: null,
      error: null,
    };

    try {
      console.log(`  [Login] ${user.key} (${user.role}) — ${user.email}`);

      const response = await apiContext.post(loginEndpoint.path, {
        data: {
          username: user.email,
          password: user.password,
        },
      });

      const status = response.status();
      const body = await response.json().catch(() => ({}));

      if (status === 200 && body.token) {
        result.token = body.token;
        console.log(`    ✓ Login successful for ${user.key}`);
      } else {
        result.error = `HTTP ${status}: ${body.message || body.error || JSON.stringify(body)}`;
        console.error(`    ✗ Login FAILED for ${user.key}: ${result.error}`);
      }
    } catch (err) {
      result.error = `Network error: ${(err as Error).message}`;
      console.error(`    ✗ Login FAILED for ${user.key}: ${result.error}`);
    }

    // Save token file regardless (contains success or failure info)
    const tokenFile = path.join(authDir, `${user.key}.token.json`);
    fs.writeFileSync(
      tokenFile,
      JSON.stringify(
        {
          key: user.key,
          role: user.role,
          token: result.token,
          error: result.error,
          authenticated: result.token !== null,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    results.push(result);
  }

  await apiContext.dispose();

  // Summary
  const succeeded = results.filter((r) => r.token !== null);
  const failed = results.filter((r) => r.token === null);

  console.log(`\n[Global Setup] Authentication Summary:`);
  console.log(`  ✓ Succeeded: ${succeeded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`  ✗ Failed: ${failed.length}/${results.length}`);
    for (const f of failed) {
      console.log(`    - ${f.key} (${f.role}): ${f.error}`);
    }
  }
  console.log('');

  // Save overall auth state summary
  fs.writeFileSync(
    path.join(authDir, '_summary.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        baseURL,
        loginEndpoint: loginEndpoint.path,
        results: results.map((r) => ({
          key: r.key,
          role: r.role,
          authenticated: r.token !== null,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  );
}

export default globalSetup;

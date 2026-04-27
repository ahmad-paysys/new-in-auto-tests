import { ApiClient } from '../fixtures/api-client.fixture';

export interface TransactionType {
  transaction_type: string;
  endpoint_path: string;
}

export interface ExistingMasking {
  txtp: string;
  txtp_version: string;
}

/**
 * A txtp that is allowed by the config API and not yet used in any masking.
 * If all allowed txtps already have maskings, `unusedVersion` provides
 * a version string that doesn't collide with existing ones.
 */
export interface AvailableTxtp {
  txtp: string;
  /** true when no masking with this txtp exists at all */
  fresh: boolean;
  /** A version guaranteed not to collide with existing ones */
  unusedVersion: string;
}

let cachedTypes: TransactionType[] | null = null;
let cachedExisting: ExistingMasking[] | null = null;
let cachedAvailable: AvailableTxtp[] | null = null;

/**
 * Fetches allowed transaction types from GET /config/api/transaction-types.
 * Results are cached so repeated calls don't hit the API again.
 */
export async function fetchAllowedTransactionTypes(
  userKey: string,
): Promise<TransactionType[]> {
  if (cachedTypes) return cachedTypes;

  const client = new ApiClient({
    userKey,
    testName: 'fetch-transaction-types',
  });

  const res = await client.get('/config/api/transaction-types');
  await client.dispose();

  if (res.status !== 200 || !Array.isArray(res.body)) {
    throw new Error(
      `Failed to fetch transaction types: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  cachedTypes = res.body as TransactionType[];
  return cachedTypes;
}

/**
 * Fetches all existing masking configs via POST /masking/api/all.
 * Paginates through all pages to get the complete list.
 */
export async function fetchExistingMaskings(
  userKey: string,
): Promise<ExistingMasking[]> {
  if (cachedExisting) return cachedExisting;

  const client = new ApiClient({
    userKey,
    testName: 'fetch-existing-maskings',
  });

  const allMasks: ExistingMasking[] = [];
  let offset = 0;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await client.post('/masking/api/all', {}, { offset, limit });
    if (res.status !== 201 || !res.body?.masks) break;

    for (const m of res.body.masks) {
      allMasks.push({ txtp: m.txtp, txtp_version: m.txtp_version ?? '' });
    }

    // If we got fewer than limit, we've reached the last page
    if (res.body.masks.length < limit) break;
    offset += limit;
  }

  await client.dispose();
  cachedExisting = allMasks;
  return cachedExisting;
}

/**
 * Builds a list of allowed txtps annotated with availability info.
 *
 * For each allowed txtp:
 * - If no masking exists with that txtp → fresh: true, unusedVersion: '01'
 * - If maskings exist → fresh: false, unusedVersion: next unused numeric version
 */
export async function getAvailableTxtps(
  userKey: string,
): Promise<AvailableTxtp[]> {
  if (cachedAvailable) return cachedAvailable;

  const [allowedTypes, existingMasks] = await Promise.all([
    fetchAllowedTransactionTypes(userKey),
    fetchExistingMaskings(userKey),
  ]);

  // Group existing maskings by txtp
  const existingByTxtp = new Map<string, Set<string>>();
  for (const m of existingMasks) {
    if (!existingByTxtp.has(m.txtp)) {
      existingByTxtp.set(m.txtp, new Set());
    }
    existingByTxtp.get(m.txtp)!.add(m.txtp_version);
  }

  cachedAvailable = allowedTypes.map((t) => {
    const usedVersions = existingByTxtp.get(t.transaction_type);
    if (!usedVersions || usedVersions.size === 0) {
      return { txtp: t.transaction_type, fresh: true, unusedVersion: '01' };
    }

    // Find the next unused numeric version
    let ver = 1;
    while (usedVersions.has(String(ver).padStart(2, '0'))) {
      ver++;
    }
    return {
      txtp: t.transaction_type,
      fresh: false,
      unusedVersion: String(ver).padStart(2, '0'),
    };
  });

  return cachedAvailable;
}

/**
 * Get a txtp+version pair guaranteed to succeed on create (no duplicate).
 * Prefers completely fresh txtps (no masking at all), falls back to unused version.
 */
export async function getCreateableTxtp(
  userKey: string,
): Promise<{ txtp: string; version: string }> {
  const available = await getAvailableTxtps(userKey);
  // Prefer a completely fresh txtp
  const fresh = available.find((a) => a.fresh);
  if (fresh) return { txtp: fresh.txtp, version: fresh.unusedVersion };

  // All txtps have at least one masking — use the first one with an unused version
  if (available.length > 0) {
    return { txtp: available[0].txtp, version: available[0].unusedVersion };
  }

  throw new Error('No allowed transaction types available to create a masking');
}

/**
 * Returns a txtp value that is guaranteed NOT in the allowed list.
 */
export const FICTIONAL_TXTP = 'jrrt-hobbit-001';

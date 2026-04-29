/**
 * Shared constants for E2E-Frontend-Only tests.
 * Timeouts can be overridden via environment variables.
 */

/** Max ms to wait for page content to render before taking a screenshot. */
export const SCREENSHOT_RENDER_TIMEOUT = Number(
  process.env.SCREENSHOT_RENDER_TIMEOUT ?? 5_000,
);

/** Max ms to wait for networkidle after navigation. */
export const NETWORK_IDLE_TIMEOUT = Number(
  process.env.NETWORK_IDLE_TIMEOUT ?? 30_000,
);

/**
 * Maps human-friendly status names to the raw enum labels shown in the frontend UI.
 * The frontend currently renders enum values (e.g. STATUS_01_IN_PROGRESS)
 * rather than display names (e.g. "In Progress").
 */
export const STATUS_LABELS: Record<string, string> = {
  'In Progress': 'STATUS_01_IN_PROGRESS',
  'Under Review': 'STATUS_03_UNDER_REVIEW',
  'Approved': 'STATUS_04_APPROVED',
  'Rejected': 'STATUS_05_REJECTED',
};

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

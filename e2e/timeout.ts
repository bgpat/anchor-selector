/** Maximum wait for any single e2e operation. Exceeding fails immediately. */
export const E2E_TIMEOUT_MS = 10_000;

export const E2E_TIMEOUT_SEC = E2E_TIMEOUT_MS / 1000;

export function capTimeoutMs(ms: number): number {
  return Math.min(ms, E2E_TIMEOUT_MS);
}

export function capTimeoutSec(sec: number): number {
  return Math.min(sec, E2E_TIMEOUT_SEC);
}

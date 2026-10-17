const runStartedAt = Date.now();

export function readActionPauseMs(): number {
  const raw = process.env.E2E_ACTION_PAUSE_MS;
  if (raw == null || raw === '') {
    return 200;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 200;
}

function formatFields(
  fields?: Record<string, string | number | boolean | undefined>,
): string {
  if (fields == null) {
    return '';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

/** Timestamped line for GitHub Actions job logs (`[e2e-op]` prefix). */
export function logE2eOp(
  event: string,
  fields?: Record<string, string | number | boolean | undefined>,
): void {
  const elapsedMs = Date.now() - runStartedAt;
  const iso = new Date().toISOString();
  console.log(`[e2e-op] ${iso} +${elapsedMs}ms ${event}${formatFields(fields)}`);
}

export async function timeE2eOp<T>(
  event: string,
  run: () => Promise<T>,
  fields?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const started = Date.now();
  logE2eOp(`${event}.start`, fields);
  try {
    const result = await run();
    logE2eOp(`${event}.end`, {
      ...fields,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    logE2eOp(`${event}.fail`, {
      ...fields,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

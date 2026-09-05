export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
export const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 413, 422]);

export type FailureKind =
  | { kind: "http"; status: number; body?: string }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "invalid_key"; body?: string }
  | { kind: "malformed"; body?: string }
  | { kind: "unsafe_url" }
  | { kind: "invalid_config" };

export function isRetryable(failure: FailureKind): boolean {
  if (failure.kind === "timeout" || failure.kind === "network") return true;
  if (failure.kind === "http") return RETRYABLE_STATUS.has(failure.status);
  return false;
}

export function classifyHttpError(status: number, body = ""): FailureKind {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) return { kind: "invalid_key", body };
  if (
    status === 400 &&
    (lower.includes("invalid api key") || lower.includes("incorrect api key") || lower.includes("unauthorized"))
  ) {
    return { kind: "invalid_key", body };
  }
  if (NON_RETRYABLE_STATUS.has(status)) {
    return { kind: "malformed", body };
  }
  return { kind: "http", status, body };
}

export const MAX_AI_RETRIES = 2;
export const PER_TASK_MAX_TOKENS = 900;
export const AUDIT_MAX_TOKENS = 700;
export const OUTREACH_MAX_TOKENS = 600;
export const ASSISTANT_MAX_TOKENS = 220;

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    shouldRetry?: (err: unknown) => boolean;
    onRetry?: (attempt: number, err: unknown) => void;
  } = {},
): Promise<T> {
  const max = opts.maxRetries ?? MAX_AI_RETRIES;
  let last: unknown;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const retry = opts.shouldRetry ? opts.shouldRetry(err) : defaultShouldRetry(err);
      if (!retry || attempt === max) throw err;
      opts.onRetry?.(attempt + 1, err);
      await sleep(200 * (attempt + 1));
    }
  }
  throw last;
}

export function defaultShouldRetry(err: unknown): boolean {
  if (err && typeof err === "object" && "failure" in err) {
    return isRetryable((err as { failure: FailureKind }).failure);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("network") || msg.includes("429") || msg.includes("503")) {
      return true;
    }
    if (msg.includes("unauthorized") || msg.includes("invalid api") || msg.includes("unsafe")) {
      return false;
    }
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

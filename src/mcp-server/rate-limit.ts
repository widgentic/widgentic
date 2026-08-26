/**
 * Per-principal token bucket for `execute_action`: a hostile client
 * looping on the tool is bounded here, per replica. The frame's
 * disable-while-in-flight is UX, not a control. SDK-free and pure over an
 * injectable clock so it is unit-testable.
 */
export interface ExecutionLimiter {
  /** Take one execution token for the principal; `false` = limited. */
  take(principalId: string): boolean;
}

export const DEFAULT_EXECUTIONS_PER_MINUTE = 60;

export function createExecutionLimiter(
  perMinute: number,
  now: () => number = () => Date.now()
): ExecutionLimiter {
  // A misconfigured rate (NaN, Infinity, 0) falls back to the default —
  // never to a bucket that refuses everything.
  const rate = Number.isFinite(perMinute) && perMinute >= 1 ? perMinute : DEFAULT_EXECUTIONS_PER_MINUTE;
  const buckets = new Map<string, { tokens: number; refilledAt: number }>();
  return {
    take(principalId) {
      const at = now();
      const bucket = buckets.get(principalId) ?? { tokens: rate, refilledAt: at };
      const elapsed = Math.max(0, at - bucket.refilledAt); // a clock stepping back drains nothing
      bucket.tokens = Math.min(rate, bucket.tokens + (elapsed / 60_000) * rate);
      bucket.refilledAt = at;
      const allowed = bucket.tokens >= 1;
      if (allowed) bucket.tokens -= 1;
      buckets.set(principalId, bucket);
      if (buckets.size > 10_000) buckets.clear(); // bounded memory; a reset is benign
      return allowed;
    }
  };
}

/**
 * API-key handling. Three rules, all of them load-bearing:
 *
 * 1. Stores hold digests, never raw keys — a leaked store dump must not be
 *    a set of working credentials.
 * 2. Comparison is constant time over fixed-length digests, so lookup
 *    timing reveals nothing about which key (or how much of it) matched.
 * 3. Key material never reaches a log line. Callers log the OUTCOME.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";

/** Prefix so keys are greppable in an incident and obvious in a diff. */
export const KEY_PREFIX = "wgk_";

/** `sha256:<hex>` — the only form a store should persist. */
export function hashKey(apiKey: string): string {
  return `sha256:${createHash("sha256").update(apiKey, "utf8").digest("hex")}`;
}

/** Generate a key. Returned once; the caller stores only its digest. */
export function generateKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

/**
 * Constant-time digest comparison. Both sides are hashed first, so the
 * compared buffers are always 32 bytes regardless of input length — length
 * alone leaks nothing.
 */
export function verifyKey(apiKey: string, storedDigest: string): boolean {
  if (typeof apiKey !== "string" || typeof storedDigest !== "string") return false;
  const presented = createHash("sha256").update(apiKey, "utf8").digest();
  const expectedHex = storedDigest.startsWith("sha256:")
    ? storedDigest.slice("sha256:".length)
    : "";
  if (expectedHex.length !== presented.length * 2) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== presented.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * Find the principal whose digest matches, comparing against EVERY
 * candidate so the work is independent of position in the list.
 */
export function findByKey<T extends { keyDigest: string }>(
  apiKey: string,
  candidates: readonly T[]
): T | undefined {
  let match: T | undefined;
  for (const candidate of candidates) {
    if (verifyKey(apiKey, candidate.keyDigest)) match = candidate;
  }
  return match;
}

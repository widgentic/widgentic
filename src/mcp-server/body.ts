/**
 * Bounded request-body reading for the HTTP edge. `execute_action` round-
 * trips whole payloads, so large bodies are normal traffic — and the reason
 * an unbounded `raw += chunk` is a memory hazard.
 */
import type { Readable } from "node:stream";

export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  readonly code = "BODY_TOO_LARGE" as const;
  constructor(readonly limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * Read a request body as UTF-8 text, stopping (and destroying the stream)
 * the moment it exceeds `maxBytes`. Throws {@link BodyTooLargeError}.
 */
export async function readBodyText(req: Readable, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : (chunk as Buffer);
    total += buffer.length;
    if (total > maxBytes) {
      req.destroy();
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A positive finite integer from an env value, or the default. */
export function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

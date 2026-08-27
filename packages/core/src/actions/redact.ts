/**
 * Redaction: every string the system emits about an execution passes
 * through here with the execution's resolved secret values, so a remote
 * service echoing a credential cannot put it into a tool result, a log line
 * or the model's context — in any of the forms it travelled in.
 */
import { isPlainObject } from "../shared/plain-object.js";

export const REDACTED = "***";

/** The raw value plus the encodings a request or an echo would carry it in. */
function forms(secret: string): string[] {
  const out = new Set<string>([secret]);
  const encoded = encodeURIComponent(secret);
  if (encoded !== secret) out.add(encoded);
  const escaped = JSON.stringify(secret).slice(1, -1);
  if (escaped !== secret) out.add(escaped);
  return [...out];
}

/** Replace every occurrence of each (non-empty) secret — raw, percent-encoded or JSON-escaped — with `***`. */
export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  // Longest first, so a secret that contains another is scrubbed whole.
  const all = secrets.filter((s) => s.length > 0).flatMap(forms).sort((a, b) => b.length - a.length);
  for (const form of all) out = out.split(form).join(REDACTED);
  return out;
}

/** Deep redaction over strings — keys included — inside arrays and plain objects; other values pass through. */
export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return redactText(node, secrets);
    if (Array.isArray(node)) return node.map(walk);
    if (isPlainObject(node)) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(node)) out[redactText(key, secrets)] = walk(entry);
      return out;
    }
    return node;
  };
  return walk(value) as T;
}

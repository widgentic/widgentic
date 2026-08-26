/**
 * Redaction: every string the system emits about an execution passes
 * through here with the execution's resolved secret values, so a remote
 * service echoing a credential cannot put it into a tool result, a log line
 * or the model's context.
 */
export const REDACTED = "***";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replace every occurrence of each (non-empty) secret with `***`. */
export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** Deep redaction over strings inside arrays and plain objects; other values pass through. */
export function redactValue<T>(value: T, secrets: readonly string[]): T {
  if (secrets.length === 0) return value;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return redactText(node, secrets);
    if (Array.isArray(node)) return node.map(walk);
    if (isPlainObject(node)) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(node)) out[key] = walk(entry);
      return out;
    }
    return node;
  };
  return walk(value) as T;
}

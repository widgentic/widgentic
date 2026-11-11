/**
 * Sealed values: a payload the surface hands out and later recognises as its
 * own without having stored it — a registered client's id, the consent
 * form's decision token, an anonymous authorization code. HMAC-SHA256 under
 * the deployment's secret, bound to a purpose so one kind can never be
 * replayed as another, compared in constant time.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SealPurpose = "client" | "decision" | "anonymous-code";

function mac(secret: string, purpose: SealPurpose, body: string): Buffer {
  return createHmac("sha256", secret).update(`${purpose}\n${body}`).digest();
}

/** `<payload>.<mac>`, both base64url. */
export function seal(secret: string, purpose: SealPurpose, payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(secret, purpose, body).toString("base64url")}`;
}

/** The payload of a value sealed here for this purpose; `undefined` for anything else. */
export function open(secret: string, purpose: SealPurpose, sealed: unknown): unknown {
  if (typeof sealed !== "string") return undefined;
  const dot = sealed.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const body = sealed.slice(0, dot);
  const presented = Buffer.from(sealed.slice(dot + 1), "base64url");
  const expected = mac(secret, purpose, body);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return undefined;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/** Package-local helpers (kept here rather than exported from core — see design D4). */

/** Structural copy of JSON-shaped data; the designers hand out copies, never their state. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A caught value's message without asserting it is an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

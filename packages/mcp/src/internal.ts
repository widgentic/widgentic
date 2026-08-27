/** Package-local helpers (kept here rather than exported from core — see design D4). */

/** A caught value's message without asserting it is an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

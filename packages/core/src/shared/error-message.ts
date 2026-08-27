/** A caught value's message without `(error as Error).message` on non-Errors. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

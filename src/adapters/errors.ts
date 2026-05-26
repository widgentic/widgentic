/**
 * Structured error returned by data adapters.
 *
 * - `code` is machine-readable.
 * - `message` is human-readable.
 * - `position` is the character offset for JSON parse errors (best-effort).
 * - `line` is the 1-based source line for CSV parse errors.
 */
export type AdapterErrorCode = "INVALID_JSON" | "INVALID_CSV";

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  position?: number;
  line?: number;
}

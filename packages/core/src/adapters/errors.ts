/**
 * Structured error returned by data adapters.
 *
 * - `code` is machine-readable.
 * - `message` is human-readable.
 * - `position` is the character offset for JSON parse errors (best-effort).
 * - `line` is the 1-based record number for CSV parse errors (best
 *   effort: it diverges from the physical source line when an earlier
 *   quoted field contains newlines).
 */
export type AdapterErrorCode = "INVALID_JSON" | "INVALID_CSV";

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  position?: number;
  line?: number;
}

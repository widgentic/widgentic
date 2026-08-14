/**
 * Structured error shape returned by the widget-contract validator.
 *
 * - `code` is machine-readable and one of {@link ErrorCode}.
 * - `message` is human-readable.
 * - `path` is the dotted path to the offending field (empty string for the
 *   payload root).
 */
export type ErrorCode =
  | "INVALID_TYPE"
  | "MISSING_FIELD"
  | "UNKNOWN_KIND"
  | "RENDER_FAILED";

export interface WidgetContractError {
  code: ErrorCode;
  message: string;
  path?: string;
}

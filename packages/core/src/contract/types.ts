/**
 * Widget contract types.
 *
 * The contract is the single payload shape that flows between agents/MCP tools
 * (producers) and widget renderers (consumers).
 */

/** Widget kind identifier (resolved against the widget catalog at render time). */
export type WidgetKind = string;

/**
 * Renderer guidance. Hints override default rendering decisions without
 * changing `data`. The exact vocabulary is per-widget; we keep it open here.
 */
export type WidgetHints = Record<string, unknown>;

/** Host chrome metadata (title/source/timestamps). All fields optional. */
export interface WidgetMeta {
  title?: string;
  subtitle?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Normalized widget payload emitted by agents and consumed by renderers.
 *
 * Unknown top-level fields are preserved (forward compatibility) via the
 * index signature.
 */
export interface WidgetPayload {
  kind: WidgetKind;
  data: unknown;
  hints?: WidgetHints;
  meta?: WidgetMeta;
  [key: string]: unknown;
}

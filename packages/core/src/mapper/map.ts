import type {
  WidgetHints,
  WidgetKind,
  WidgetMeta,
  WidgetPayload
} from "../contract/types.js";
import { inferKind } from "./infer.js";

/**
 * Mapper input: a widget payload whose `kind` is optional. Callers wrap raw
 * data as `mapToWidget({ data })`; unknown top-level fields pass through
 * (forward compatibility, matching the contract).
 */
export interface MapperInput {
  kind?: WidgetKind;
  data: unknown;
  hints?: WidgetHints;
  meta?: WidgetMeta;
  [key: string]: unknown;
}

/**
 * Produce a complete widget payload from a partial one.
 *
 * Total: never throws and has no error result. A missing, non-string, or
 * empty `kind` is filled from `inferKind(input.data)`; an explicit non-empty
 * string `kind` is preserved unchanged. Returns a new top-level object — the
 * input is not mutated and `data`/`hints`/`meta` pass through by reference.
 */
export function mapToWidget(input: MapperInput): WidgetPayload {
  // Defensive totality: an untyped JS caller may pass a non-object; treat it
  // as bare data rather than throwing.
  const source: MapperInput =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? input
      : { data: input };
  const kind =
    typeof source.kind === "string" && source.kind.length > 0
      ? source.kind
      : inferKind(source.data);
  return { ...source, kind };
}

/**
 * Hint-coherence analysis: pure, render-independent diagnostics for the
 * gap forward compatibility creates — unknown or unmatched hints are
 * (correctly) ignored by renderers, so without this an agent that
 * misspells `columns` or aims `fieldFormat` at a missing field never
 * finds out. Diagnostics are advice for the model-facing channel; they
 * never fail or alter a render, and renderers never call this.
 */
import { isLinkableUrl, isSafeImageSrc } from "../contract/urls.js";
import type { WidgetDescriptor, WidgetDescriptorInput } from "./descriptors.js";
import { isPlainObject } from "./widgets/format.js";

export type HintDiagnosticCode =
  | "UNKNOWN_HINT"
  | "NO_MATCH"
  | "INVALID_VALUE"
  | "UNSAFE_IMAGE_SOURCE"
  | "UNSAFE_LINK_TARGET";

export interface HintDiagnostic {
  /** Dotted hint path, e.g. `"columns"` or `"images.avatar"`. */
  hint: string;
  code: HintDiagnosticCode;
  message: string;
  /** Advertised key within edit distance 2, when one exists. */
  suggestion?: string;
}

const IMAGE_SHAPES = new Set<unknown>(["avatar", "thumb", "hero", true, false]);

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] as number;
      prev[j] = Math.min(
        above + 1,
        (prev[j - 1] as number) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return prev[b.length] as number;
}

function nearestKey(key: string, advertised: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of advertised) {
    const distance = levenshtein(key.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Column universe as the table renderer sees it. */
function tableColumns(data: unknown): Set<string> {
  const rows = Array.isArray(data) ? data : [data];
  const columns = new Set<string>();
  for (const row of rows) {
    if (isPlainObject(row)) {
      for (const key of Object.keys(row)) columns.add(key);
    } else {
      columns.add("value");
    }
  }
  return columns;
}

/** Field universe as the card renderer sees it. */
function cardFields(data: unknown): Set<string> {
  if (!isPlainObject(data)) return new Set();
  if (isPlainObject(data.fields)) return new Set(Object.keys(data.fields));
  return new Set(Object.keys(data).filter((k) => k !== "title" && k !== "subtitle"));
}

function fieldValue(kind: string, data: unknown, key: string): unknown {
  if (kind === "table") {
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      if (isPlainObject(row) && key in row) return row[key];
    }
    return undefined;
  }
  if (!isPlainObject(data)) return undefined;
  if (isPlainObject(data.fields) && key in data.fields) return data.fields[key];
  return data[key];
}

/**
 * Analyze a render request's hints against its data and descriptor.
 * Total: any input shape returns an array without throwing; empty or
 * non-object `hints` produce no diagnostics.
 */
export function analyzeHints(
  kind: string,
  data: unknown,
  hints: unknown,
  descriptor?: WidgetDescriptor | WidgetDescriptorInput | undefined
): HintDiagnostic[] {
  if (!isPlainObject(hints)) return [];
  const diagnostics: HintDiagnostic[] = [];
  const advertised = isPlainObject(descriptor?.hints)
    ? Object.keys(descriptor.hints)
    : [];

  for (const [key, value] of Object.entries(hints)) {
    if (!advertised.includes(key)) {
      const suggestion = nearestKey(key, advertised);
      const diagnostic: HintDiagnostic = {
        hint: key,
        code: "UNKNOWN_HINT",
        message:
          suggestion === undefined
            ? `unknown hint for kind '${kind}'`
            : `unknown hint for kind '${kind}' — did you mean '${suggestion}'?`
      };
      if (suggestion !== undefined) diagnostic.suggestion = suggestion;
      diagnostics.push(diagnostic);
      continue;
    }

    if (kind === "group") {
      // Group hints select layout presets; values are checked against the
      // fixed vocabularies (the renderer falls back silently — this is
      // where the caller finds out).
      if (key === "layout" && !["stack", "row", "grid"].some((known) => known === value)) {
        diagnostics.push({
          hint: "layout",
          code: "INVALID_VALUE",
          message: "'layout' must be 'stack', 'row', or 'grid' (fell back to 'stack')"
        });
      } else if (key === "gap" && !["none", "sm", "md", "lg"].some((known) => known === value)) {
        diagnostics.push({
          hint: "gap",
          code: "INVALID_VALUE",
          message: "'gap' must be 'none', 'sm', 'md', or 'lg' (fell back to 'md')"
        });
      } else if (key === "columns") {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 4) {
          diagnostics.push({
            hint: "columns",
            code: "INVALID_VALUE",
            message: "'columns' must be a number from 1 to 4 (clamped)"
          });
        } else if (!isPlainObject(hints) || hints.layout !== "grid") {
          diagnostics.push({
            hint: "columns",
            code: "NO_MATCH",
            message: "'columns' only applies with layout: 'grid'"
          });
        }
      }
      continue;
    }

    if (key === "columns") {
      if (!Array.isArray(value) || value.some((c) => typeof c !== "string")) {
        diagnostics.push({
          hint: "columns",
          code: "INVALID_VALUE",
          message: "'columns' must be an array of column-name strings"
        });
        continue;
      }
      const columns = tableColumns(data);
      for (const column of value) {
        if (!columns.has(column as string)) {
          diagnostics.push({
            hint: `columns.${column}`,
            code: "NO_MATCH",
            message: `column '${column}' matches no record key in data`
          });
        }
      }
    } else if (key === "fieldFormat") {
      if (!isPlainObject(value)) {
        diagnostics.push({
          hint: "fieldFormat",
          code: "INVALID_VALUE",
          message: "'fieldFormat' must be a Record<fieldKey, pattern string>"
        });
        continue;
      }
      const fields = kind === "table" ? tableColumns(data) : cardFields(data);
      for (const [field, pattern] of Object.entries(value)) {
        if (!fields.has(field)) {
          diagnostics.push({
            hint: `fieldFormat.${field}`,
            code: "NO_MATCH",
            message: `'${field}' matches no ${kind === "table" ? "column" : "field"} in data`
          });
        } else if (typeof pattern !== "string") {
          diagnostics.push({
            hint: `fieldFormat.${field}`,
            code: "INVALID_VALUE",
            message: `the pattern for '${field}' must be a string`
          });
        }
      }
    } else if (key === "images") {
      if (!isPlainObject(value)) {
        diagnostics.push({
          hint: "images",
          code: "INVALID_VALUE",
          message:
            "'images' must be a Record<key, 'avatar' | 'thumb' | 'hero' | true | false>"
        });
        continue;
      }
      const keys = kind === "table" ? tableColumns(data) : cardFields(data);
      for (const [field, shape] of Object.entries(value)) {
        if (!keys.has(field)) {
          diagnostics.push({
            hint: `images.${field}`,
            code: "NO_MATCH",
            message: `'${field}' matches no ${kind === "table" ? "column" : "field"} in data`
          });
          continue;
        }
        if (!IMAGE_SHAPES.has(shape)) {
          diagnostics.push({
            hint: `images.${field}`,
            code: "INVALID_VALUE",
            message:
              `'${String(shape)}' is not an image shape — use 'avatar' | 'thumb' | 'hero' | true | false`
          });
          continue;
        }
        if (shape === false) continue;
        const target = fieldValue(kind, data, field);
        if (typeof target !== "string" || !isSafeImageSrc(target)) {
          diagnostics.push({
            hint: `images.${field}`,
            code: "UNSAFE_IMAGE_SOURCE",
            message: `the value of '${field}' is not a safe image source (https or data:image/*)`
          });
        }
      }
    } else if (key === "links") {
      if (!isPlainObject(value)) {
        diagnostics.push({
          hint: "links",
          code: "INVALID_VALUE",
          message: "'links' must be a Record<key, boolean>"
        });
        continue;
      }
      const keys = kind === "table" ? tableColumns(data) : cardFields(data);
      for (const [field, flag] of Object.entries(value)) {
        if (typeof flag !== "boolean" && typeof flag !== "string") {
          diagnostics.push({
            hint: `links.${field}`,
            code: "INVALID_VALUE",
            message:
              `the value for '${field}' must be true, false, or a scheme prefix string (e.g. 'mailto:')`
          });
          continue;
        }
        if (!keys.has(field)) {
          diagnostics.push({
            hint: `links.${field}`,
            code: "NO_MATCH",
            message: `'${field}' matches no ${kind === "table" ? "column" : "field"} in data`
          });
          continue;
        }
        if (flag === false) continue;
        const target = fieldValue(kind, data, field);
        // The renderer links `true` values as-is and composes prefix + value;
        // either way the checked URL is what the href would actually be.
        const href =
          typeof target === "string" && target !== ""
            ? flag === true
              ? target
              : flag + target
            : undefined;
        if (href === undefined || !isLinkableUrl(href)) {
          diagnostics.push({
            hint: `links.${field}`,
            code: "UNSAFE_LINK_TARGET",
            message:
              flag === true
                ? `the value of '${field}' is not a linkable URL (http, https, mailto, or tel) — it renders as text`
                : `'${String(flag)}' + the value of '${field}' does not compose to a linkable URL (http, https, mailto, or tel) — it renders as text`
          });
        }
      }
    } else if (key === "expandDepth") {
      if (typeof value !== "number") {
        diagnostics.push({
          hint: "expandDepth",
          code: "INVALID_VALUE",
          message: "'expandDepth' must be a number"
        });
      }
    }
  }
  return diagnostics;
}

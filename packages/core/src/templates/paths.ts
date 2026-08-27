/**
 * The template path grammar, shared by validation (strict) and
 * interpretation (lenient) so the two never drift:
 *
 *   "."                      the current scope itself
 *   "$index"                 zero-based position in the innermost `each`
 *   "$meta.<segments>"       reads payload.meta
 *   "$root[.<segments>]"     reads payload.data regardless of `each` nesting
 *   "$parent"+ [.<rest>]     steps out of one enclosing `each` per token;
 *                            <rest> is segments, "$index", or nothing
 *   "<segments>"             dot path against the current scope
 *
 * Reserved tokens (`$meta`, `$root`, `$parent`, `$index`) are only valid in
 * the positions above; anywhere else the path is invalid.
 */
export interface ParsedPath {
  base: "scope" | "meta" | "root";
  /** Enclosing-scope hops (`$parent` count). */
  up: number;
  /** The path names the current index rather than a value. */
  index: boolean;
  segments: string[];
}

const RESERVED = new Set(["$meta", "$root", "$parent", "$index"]);

/** Parse a path; `undefined` when the syntax is invalid. Never throws. */
export function parsePath(value: string): ParsedPath | undefined {
  if (value === ".") return { base: "scope", up: 0, index: false, segments: [] };
  const tokens = value.split(".");
  let i = 0;
  let base: ParsedPath["base"] = "scope";
  let up = 0;
  if (tokens[0] === "$meta") {
    base = "meta";
    i = 1;
  } else if (tokens[0] === "$root") {
    base = "root";
    i = 1;
  } else {
    while (tokens[i] === "$parent") {
      up++;
      i++;
    }
  }
  const rest = tokens.slice(i);
  if (rest.length === 1 && rest[0] === "$index") {
    if (base !== "scope") return undefined;
    return { base, up, index: true, segments: [] };
  }
  if (rest.length === 0) {
    if (base === "meta") return undefined;
    return { base, up, index: false, segments: [] };
  }
  if (rest.some((segment) => segment === "" || RESERVED.has(segment))) return undefined;
  return { base, up, index: false, segments: rest };
}

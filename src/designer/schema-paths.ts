/**
 * Path helpers over widgentic's dataSchema subset, shared by the template
 * panel (bind/each/when completions) and the binding editor (input and
 * output mapping completions, type checks). Nullable type arrays pick the
 * PRIMARY type; `any` (no type) is treated as unknown, never mismatched.
 */
import { isPlainObject } from "../shared/plain-object.js";
/** The primary type a schema declares, if any. */
export function schemaType(schema: unknown): string | undefined {
  if (!isPlainObject(schema)) return undefined;
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) {
    const primary = type.find((t) => typeof t === "string" && t !== "null");
    if (typeof primary === "string") return primary;
  }
  return undefined;
}

/**
 * Dotted paths reachable from a schema, with the schema at each path.
 * Arrays are offered as themselves; descending into their items needs an
 * `each` first, so collection stops there.
 */
export function collectPaths(
  schema: unknown,
  prefix: string,
  out: { path: string; schema: unknown }[],
  depth = 0
): void {
  if (!isPlainObject(schema) || depth > 3) return;
  if (schemaType(schema) !== "object" || !isPlainObject(schema.properties)) return;
  for (const [name, sub] of Object.entries(schema.properties)) {
    const path = prefix === "" ? name : `${prefix}.${name}`;
    out.push({ path, schema: sub });
    collectPaths(sub, path, out, depth + 1);
  }
}

/** The sub-schema at a dotted path ("" or "." is the schema itself). */
export function schemaAt(schema: unknown, path: string): unknown {
  if (path === "" || path === ".") return schema;
  let current: unknown = schema;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    if (schemaType(current) === "array") {
      current = isPlainObject(current.items) ? current.items : undefined;
      if (!/^\d+$/.test(segment)) {
        // A named segment under an array steps into the item schema.
        if (!isPlainObject(current) || !isPlainObject(current.properties)) return undefined;
        current = current.properties[segment];
      }
      continue;
    }
    if (!isPlainObject(current.properties)) return undefined;
    current = current.properties[segment];
  }
  return current;
}

/** Numeric types agree with each other; unknown never mismatches. */
export function typesConflict(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const norm = (t: string) => (t === "integer" ? "number" : t);
  return norm(a) !== norm(b);
}

/** All dotted paths under a schema (leaves and branches), for completions. */
export function allPaths(schema: unknown): string[] {
  const entries: { path: string; schema: unknown }[] = [];
  collectPaths(schema, "", entries);
  return entries.map((entry) => entry.path);
}

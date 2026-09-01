/**
 * Path helpers over widgentic's dataSchema subset, shared by the template
 * panel (bind/each/when completions) and the binding editor (input and
 * output mapping completions, type checks). Nullable type arrays pick the
 * PRIMARY type; `any` (no type) is treated as unknown, never mismatched.
 */
import { isPlainObject } from "@widgentic/core";
/** The primary type a schema declares, if any. */
/** How deep completions and type checks descend; schemas are JSON, but bounded anyway. */
const MAX_SCHEMA_DEPTH = 3;

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
 * Enumerate the paths a scope offers. Context-free on purpose: an array is
 * offered as ITSELF and never descended, because neither the template
 * resolver nor the projection steps into an array by name (`lines.qty`
 * resolves to nothing; `lines.0.qty` does). A caller whose scope IS the
 * item — a template inside an each, a projection over a list response —
 * passes the item schema (`itemSchema`) instead.
 */
export function collectPaths(
  schema: unknown,
  prefix: string,
  out: { path: string; schema: unknown }[],
  depth = 0
): void {
  if (!isPlainObject(schema) || depth > MAX_SCHEMA_DEPTH) return;
  if (schemaType(schema) !== "object" || !isPlainObject(schema.properties)) return;
  for (const [name, sub] of Object.entries(schema.properties)) {
    const path = prefix === "" ? name : `${prefix}.${name}`;
    out.push({ path, schema: sub });
    collectPaths(sub, path, out, depth + 1);
  }
}

/** The item schema of an array, or the schema itself when it is not one. */
export function itemSchema(schema: unknown): unknown {
  return isPlainObject(schema) && schemaType(schema) === "array"
    ? schema.items
    : schema;
}

/** The sub-schema at a dotted path ("" or "." is the schema itself). */
export function schemaAt(schema: unknown, path: string): unknown {
  if (path === "" || path === ".") return schema;
  let current: unknown = schema;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    if (schemaType(current) === "array") {
      // Arrays are stepped into by INDEX only — the resolvers' own rule.
      if (!/^\d+$/.test(segment)) return undefined;
      current = itemSchema(current);
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

/**
 * Compare a source and a target schema for the projection editor,
 * descending MATCHED array sides so two lists are judged by their ITEM
 * types — the shape a per-item projection has. Returns the conflicting
 * type labels, or `undefined` when the two agree.
 */
export function schemaMismatch(
  source: unknown,
  target: unknown
): { source: string | undefined; target: string | undefined } | undefined {
  let a = source;
  let b = target;
  for (let depth = 0; depth < MAX_SCHEMA_DEPTH; depth++) {
    if (schemaType(a) !== "array" || schemaType(b) !== "array") break;
    a = itemSchema(a);
    b = itemSchema(b);
  }
  const sourceType = schemaType(a);
  const targetType = schemaType(b);
  return typesConflict(sourceType, targetType)
    ? { source: sourceType, target: targetType }
    : undefined;
}

/** All dotted paths under a schema (leaves and branches), for completions. */
export function allPaths(schema: unknown): string[] {
  const entries: { path: string; schema: unknown }[] = [];
  collectPaths(schema, "", entries);
  return entries.map((entry) => entry.path);
}

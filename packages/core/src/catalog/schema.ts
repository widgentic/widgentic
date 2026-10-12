import type { WidgetContractError } from "../contract/errors.js";

/**
 * A JSON-Schema *subset* for widget `data`: `type`, `properties`,
 * `required`, `items`, `enum`, `pattern`. Unknown keywords are ignored
 * (forward compatible), never misinterpreted — and that policy extends to
 * `pattern` values this module refuses to run (see the ReDoS bounds
 * below). Violations map to the existing contract vocabulary with dotted
 * paths into the data.
 */
export type DataSchema = Record<string, unknown>;

// `pattern` bounds: schemas arrive from descriptor authors, but the strings
// they test arrive from agents — an exponential-backtracking pattern over
// attacker-lengthened input is a denial of service. Overlong patterns,
// nested-quantifier shapes, and RegExp-invalid sources are IGNORED (never
// misinterpreted as passing or failing); tested strings are capped.
/** Longest `pattern` the validator will compile. */
export const PATTERN_MAX_LENGTH = 256;
const TESTED_STRING_MAX = 10_000;
const NESTED_QUANTIFIER = /(\([^)]*[+*][^)]*\)|\[[^\]]*\][+*])[+*{]/;

function compileSafePattern(pattern: unknown): RegExp | undefined {
  if (typeof pattern !== "string" || pattern.length > PATTERN_MAX_LENGTH) {
    return undefined;
  }
  if (NESTED_QUANTIFIER.test(pattern)) return undefined;
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `type` names the validator checks; any other name constrains nothing. */
export const DATA_SCHEMA_TYPES: readonly string[] = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null"
];

function matchesSingleType(type: string, data: unknown): boolean {
  switch (type) {
    case "object":
      return isPlainObject(data);
    case "array":
      return Array.isArray(data);
    case "string":
      return typeof data === "string";
    case "number":
      return typeof data === "number";
    case "integer":
      return typeof data === "number" && Number.isInteger(data);
    case "boolean":
      return typeof data === "boolean";
    case "null":
      return data === null;
    default:
      // Unknown type keyword: ignore rather than reject.
      return true;
  }
}

function matchesType(type: unknown, data: unknown): boolean {
  if (typeof type === "string") return matchesSingleType(type, data);
  if (Array.isArray(type)) {
    return type.some(
      (candidate) =>
        typeof candidate === "string" && matchesSingleType(candidate, data)
    );
  }
  return true;
}

function enumMatches(allowed: unknown[], data: unknown): boolean {
  return allowed.some((value) => {
    if (value === data) return true;
    try {
      return JSON.stringify(value) === JSON.stringify(data);
    } catch {
      return false;
    }
  });
}

function formatType(type: unknown): string {
  return Array.isArray(type) ? type.join(" | ") : String(type);
}

/**
 * Validate `data` against a subset schema. Returns the first violation as a
 * contract-vocabulary error (`MISSING_FIELD` for required, `INVALID_TYPE`
 * for type/enum) with a dotted path, or `undefined` when valid. Never
 * throws.
 */
export function validateDataAgainstSchema(
  schema: DataSchema,
  data: unknown,
  path = "data"
): WidgetContractError | undefined {
  if (Array.isArray(schema.enum) && !enumMatches(schema.enum, data)) {
    return {
      code: "INVALID_TYPE",
      path,
      message: `Value at '${path}' must be one of the enumerated options.`
    };
  }

  if (schema.type !== undefined && !matchesType(schema.type, data)) {
    return {
      code: "INVALID_TYPE",
      path,
      message: `Value at '${path}' must have type ${formatType(schema.type)}.`
    };
  }

  // Pattern applies to string data only — type mismatches are `type`'s job.
  if (typeof data === "string" && schema.pattern !== undefined) {
    const regex = compileSafePattern(schema.pattern);
    if (regex !== undefined && !regex.test(data.slice(0, TESTED_STRING_MAX))) {
      return {
        code: "INVALID_TYPE",
        path,
        message: `Value at '${path}' must match pattern ${String(schema.pattern)}.`
      };
    }
  }

  if (isPlainObject(data)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in data)) {
          return {
            code: "MISSING_FIELD",
            path: `${path}.${key}`,
            message: `Missing required property '${key}'.`
          };
        }
      }
    }
    if (isPlainObject(schema.properties)) {
      for (const [key, subschema] of Object.entries(schema.properties)) {
        if (key in data && isPlainObject(subschema)) {
          const error = validateDataAgainstSchema(
            subschema,
            data[key],
            `${path}.${key}`
          );
          if (error) return error;
        }
      }
    }
  }

  if (Array.isArray(data) && isPlainObject(schema.items)) {
    for (let i = 0; i < data.length; i++) {
      const error = validateDataAgainstSchema(
        schema.items as DataSchema,
        data[i],
        `${path}.${i}`
      );
      if (error) return error;
    }
  }

  return undefined;
}

/**
 * What the validator would silently ignore in a schema: an unknown `type`
 * name, a `pattern` it refuses to run, or a subset keyword of the wrong
 * shape. Warnings, never refusals — stores accept these (unknown input is
 * ignored, not misread), but an author meant something by them. Paths are
 * dotted from `path`. Never throws.
 */
export function auditDataSchema(schema: DataSchema, path = "schema"): string[] {
  const warnings: string[] = [];
  const type = schema.type;
  if (type !== undefined) {
    const names = typeof type === "string" ? [type] : Array.isArray(type) ? type : undefined;
    if (names === undefined) {
      warnings.push(`${path}.type: must be a type name or a list of them; it is ignored.`);
    } else {
      for (const name of names) {
        if (typeof name !== "string" || !DATA_SCHEMA_TYPES.includes(name)) {
          warnings.push(
            `${path}.type: '${String(name)}' is not one of ${DATA_SCHEMA_TYPES.join(", ")}; it constrains nothing.`
          );
        }
      }
    }
  }
  if (schema.pattern !== undefined && compileSafePattern(schema.pattern) === undefined) {
    warnings.push(
      `${path}.pattern: not run — it must be a valid regular expression of at most ${PATTERN_MAX_LENGTH} characters without nested quantifiers.`
    );
  }
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    warnings.push(`${path}.enum: must be a list of values; it is ignored.`);
  }
  if (
    schema.required !== undefined &&
    !(Array.isArray(schema.required) && schema.required.every((key) => typeof key === "string"))
  ) {
    warnings.push(`${path}.required: must be a list of property names; it is ignored.`);
  }
  if (schema.properties !== undefined) {
    if (!isPlainObject(schema.properties)) {
      warnings.push(`${path}.properties: must be an object of schemas; it is ignored.`);
    } else {
      for (const [key, subschema] of Object.entries(schema.properties)) {
        if (isPlainObject(subschema)) warnings.push(...auditDataSchema(subschema, `${path}.properties.${key}`));
        else warnings.push(`${path}.properties.${key}: must be a schema object; it is ignored.`);
      }
    }
  }
  if (schema.items !== undefined) {
    if (isPlainObject(schema.items)) warnings.push(...auditDataSchema(schema.items, `${path}.items`));
    else warnings.push(`${path}.items: must be a schema object; it is ignored.`);
  }
  return warnings;
}

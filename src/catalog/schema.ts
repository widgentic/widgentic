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

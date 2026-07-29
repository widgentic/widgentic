import type { WidgetContractError } from "../contract/errors.js";

/**
 * A JSON-Schema *subset* for widget `data`: `type`, `properties`,
 * `required`, `items`, `enum`. Unknown keywords are ignored (forward
 * compatible), never misinterpreted. Violations map to the existing
 * contract vocabulary with dotted paths into the data.
 */
export type DataSchema = Record<string, unknown>;

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

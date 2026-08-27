import type { WidgetPayload } from "./types.js";
import type { WidgetContractError } from "./errors.js";

export interface ValidateOptions {
  /**
   * If provided and non-empty, payloads whose `kind` is not in the set fail
   * with `UNKNOWN_KIND`. When omitted or empty, kind membership is not
   * checked (kind format is still validated).
   */
  knownKinds?: ReadonlySet<string>;
}

export type ValidateResult =
  | { ok: true; payload: WidgetPayload }
  | { ok: false; error: WidgetContractError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an unknown input against the widget contract.
 *
 * Returns a discriminated result. The `payload` returned on success is the
 * original input (unknown top-level fields are preserved for forward
 * compatibility).
 */
export function validateWidgetPayload(
  input: unknown,
  options: ValidateOptions = {}
): ValidateResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "",
        message: "Payload must be a plain object."
      }
    };
  }

  if (!("kind" in input)) {
    return {
      ok: false,
      error: {
        code: "MISSING_FIELD",
        path: "kind",
        message: "Payload is missing required field 'kind'."
      }
    };
  }

  const kind = input.kind;
  if (typeof kind !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "kind",
        message: "Field 'kind' must be a string."
      }
    };
  }
  if (kind.length === 0) {
    return {
      ok: false,
      error: {
        code: "MISSING_FIELD",
        path: "kind",
        message: "Field 'kind' must be a non-empty string."
      }
    };
  }

  if (!("data" in input)) {
    return {
      ok: false,
      error: {
        code: "MISSING_FIELD",
        path: "data",
        message: "Payload is missing required field 'data'."
      }
    };
  }

  if ("hints" in input && input.hints !== undefined && !isPlainObject(input.hints)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "hints",
        message: "Field 'hints' must be an object when present."
      }
    };
  }

  if ("meta" in input && input.meta !== undefined && !isPlainObject(input.meta)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        path: "meta",
        message: "Field 'meta' must be an object when present."
      }
    };
  }

  const { knownKinds } = options;
  if (knownKinds && knownKinds.size > 0 && !knownKinds.has(kind)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_KIND",
        path: "kind",
        message: `Unknown widget kind '${kind}'.`
      }
    };
  }

  // Preserve unknown top-level fields by returning the original input.
  return { ok: true, payload: input as WidgetPayload };
}

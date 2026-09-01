import { isPlainObject } from "../shared/plain-object.js";
import type { TemplateError, WidgetTemplate } from "./types.js";
import { FORBIDDEN_ATTR, FORBIDDEN_TAGS, MAX_TEMPLATE_DEPTH, RESERVED_ATTR } from "./guards.js";
import { parsePath } from "./paths.js";
import { validateActionBinding } from "../actions/validate.js";
import {
  CURRENCY_CODE,
  CURRENCY_DISPLAYS,
  DATE_PATTERN_ALLOWED,
  DATE_PATTERN_MAX,
  DATE_TOKENS,
  FORMAT_DECIMALS_MAX,
  FORMAT_DECIMALS_MIN,
  FORMAT_TYPES,
  LOCALE_TAG,
  isCurrencyDisplay,
  isFormatType,
  isKnownLocale,
  parseFormatSpec,
  tokenizeDatePattern
} from "../catalog/widgets/value-format.js";

export type ValidateTemplateResult =
  | { ok: true; template: WidgetTemplate }
  | { ok: false; error: TemplateError };

/**
 * Thrown by `registerTemplate` when the template fails validation —
 * registration is host setup, where failing loudly is the convention.
 * Carries the structured error for programmatic handling.
 */
export class InvalidTemplateError extends Error {
  readonly templateError: TemplateError;

  constructor(kind: string, error: TemplateError) {
    super(
      `Invalid widget template for kind '${kind}' at '${error.path}': ${error.message} (${error.code})`
    );
    this.name = "InvalidTemplateError";
    this.templateError = error;
  }
}

function join(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

function nodeError(message: string, path: string): TemplateError {
  return { code: "INVALID_TEMPLATE_NODE", message, path };
}

/**
 * The `format` spec: a closed vocabulary of author literals. Every bound
 * comes from the engine's own exported constants, so a change to the
 * engine cannot leave the validator (or the guide) behind.
 */
function checkFormat(
  spec: unknown,
  label: string,
  path: string
): TemplateError | undefined {
  const bad = (message: string): TemplateError => nodeError(`${label}: ${message}`, path);
  if (!isPlainObject(spec)) return bad("'format' must be an object.");
  if (!isFormatType(spec.type)) {
    return bad(`'format.type' must be one of ${FORMAT_TYPES.join(", ")}.`);
  }
  if (spec.type === "date") {
    if (typeof spec.pattern !== "string") {
      return bad("'format.pattern' must be a string.");
    }
    if (spec.pattern.length === 0 || spec.pattern.length > DATE_PATTERN_MAX) {
      return bad(`'format.pattern' must be 1-${DATE_PATTERN_MAX} characters.`);
    }
    if (!DATE_PATTERN_ALLOWED.test(spec.pattern)) {
      return bad("'format.pattern' may contain only the date tokens and separators.");
    }
    if (tokenizeDatePattern(spec.pattern) === undefined) {
      return bad(
        `'format.pattern' must use at least one of ${DATE_TOKENS.join(", ")} and no stray letters.`
      );
    }
    return undefined;
  }
  if (spec.decimals !== undefined) {
    if (
      typeof spec.decimals !== "number" ||
      !Number.isInteger(spec.decimals) ||
      spec.decimals < FORMAT_DECIMALS_MIN ||
      spec.decimals > FORMAT_DECIMALS_MAX
    ) {
      return bad(
        `'format.decimals' must be an integer ${FORMAT_DECIMALS_MIN}-${FORMAT_DECIMALS_MAX}.`
      );
    }
  }
  if (spec.locale !== undefined) {
    if (typeof spec.locale !== "string" || !LOCALE_TAG.test(spec.locale) || !isKnownLocale(spec.locale)) {
      return bad("'format.locale' must be a BCP-47 language tag this runtime knows.");
    }
  }
  if (spec.type === "currency") {
    if (typeof spec.currency !== "string" || !CURRENCY_CODE.test(spec.currency)) {
      return bad("'format.currency' must be a three-letter uppercase ISO-4217 code.");
    }
    if (spec.currencyDisplay !== undefined && !isCurrencyDisplay(spec.currencyDisplay)) {
      return bad(`'format.currencyDisplay' must be one of ${CURRENCY_DISPLAYS.join(", ")}.`);
    }
  }
  // The engine narrows the same shape; a spec it would degrade never passes.
  return parseFormatSpec(spec) === undefined ? bad("'format' is not a spec the engine accepts.") : undefined;
}

/** The value transforms a bind may carry — at most one of them per value. */
export const TRANSFORM_KEYS = ["map", "prefix", "format"] as const;

export type TransformKey = (typeof TRANSFORM_KEYS)[number];

/** Which transform a bind value carries, or `undefined`; `"conflict"` when more than one. */
export function activeTransform(value: Record<string, unknown>): TransformKey | "conflict" | undefined {
  const present = TRANSFORM_KEYS.filter((key) => value[key] !== undefined);
  if (present.length > 1) return "conflict";
  return present[0];
}

/** Path syntax per paths.ts: ".", "$index", "$meta."/"$root."/"$parent."-prefixed, or dot segments. */
function checkPathSyntax(value: string, path: string): TemplateError | undefined {
  if (parsePath(value) !== undefined) return undefined;
  return {
    code: "INVALID_PATH",
    message: `Invalid data path '${value}'.`,
    path
  };
}

function check(node: unknown, path: string, depth: number): TemplateError | undefined {
  if (depth > MAX_TEMPLATE_DEPTH) {
    return {
      code: "TEMPLATE_TOO_DEEP",
      message: `Template exceeds the maximum nesting depth of ${MAX_TEMPLATE_DEPTH}.`,
      path
    };
  }
  if (typeof node === "string") return undefined;
  if (!isPlainObject(node)) {
    return nodeError("Template node must be a string or a plain object.", path);
  }

  if ("bind" in node) {
    if (typeof node.bind !== "string") {
      return nodeError("'bind' must be a string path.", path);
    }
    const pathError = checkPathSyntax(node.bind, path);
    if (pathError) return pathError;
    // A text bind takes `map` (value → authored label) or `format`, never
    // both. `prefix` is an attribute-value transform: ignored here and kept
    // valid, so no stored template is refused on read for carrying it.
    if (node.map !== undefined && node.format !== undefined) {
      return nodeError("A text bind carries either 'map' or 'format' — one transform per value.", path);
    }
    if (node.map !== undefined) {
      if (!isPlainObject(node.map) || Object.values(node.map).some((entry) => typeof entry !== "string")) {
        return nodeError("Bind: 'map' must be an object of string values.", path);
      }
      if (node.default !== undefined && typeof node.default !== "string") {
        return nodeError("Bind: 'default' must be a string.", path);
      }
      return undefined;
    }
    if (node.default !== undefined) {
      return nodeError("Bind: 'default' requires 'map'.", path);
    }
    if (node.format !== undefined) {
      return checkFormat(node.format, "Bind", path);
    }
    return undefined;
  }

  if ("each" in node) {
    if (typeof node.each !== "string") {
      return nodeError("'each' must be a string path.", path);
    }
    const pathError = checkPathSyntax(node.each, path);
    if (pathError) return pathError;
    if (!("template" in node)) {
      return nodeError("'each' node requires a 'template'.", path);
    }
    const templateError = check(node.template, join(path, "template"), depth + 1);
    if (templateError) return templateError;
    if ("empty" in node && node.empty !== undefined) {
      return check(node.empty, join(path, "empty"), depth + 1);
    }
    return undefined;
  }

  if ("when" in node) {
    if (typeof node.when !== "string") {
      return nodeError("'when' must be a string path.", path);
    }
    const pathError = checkPathSyntax(node.when, path);
    if (pathError) return pathError;
    if (!("template" in node)) {
      return nodeError("'when' node requires a 'template'.", path);
    }
    const templateError = check(node.template, join(path, "template"), depth + 1);
    if (templateError) return templateError;
    if ("else" in node && node.else !== undefined) {
      return check(node.else, join(path, "else"), depth + 1);
    }
    return undefined;
  }

  if ("tag" in node) {
    if (typeof node.tag !== "string" || node.tag.length === 0) {
      return nodeError("'tag' must be a non-empty string.", path);
    }
    if (FORBIDDEN_TAGS.has(node.tag.toLowerCase())) {
      return {
        code: "FORBIDDEN_TAG",
        message: `Element '${node.tag}' is not allowed in templates (active or foreign content).`,
        path
      };
    }
    if ("attrs" in node && node.attrs !== undefined) {
      if (!isPlainObject(node.attrs)) {
        return nodeError("'attrs' must be an object.", path);
      }
      for (const [name, value] of Object.entries(node.attrs)) {
        const attrPath = join(path, `attrs.${name}`);
        if (FORBIDDEN_ATTR.test(name)) {
          return {
            code: "FORBIDDEN_ATTRIBUTE",
            message: `Attribute '${name}' is not allowed in templates (event handlers and srcdoc).`,
            path: attrPath
          };
        }
        if (RESERVED_ATTR.test(name)) {
          return {
            code: "FORBIDDEN_ATTRIBUTE",
            message: `Attribute '${name}' is reserved for the renderer (data-wg-*); use an 'action' binding.`,
            path: attrPath
          };
        }
        if (typeof value === "string") continue;
        if (isPlainObject(value) && typeof value.bind === "string") {
          const pathError = checkPathSyntax(value.bind, attrPath);
          if (pathError) return pathError;
          // One transform per value: map selects an authored literal,
          // prefix glues one in front, format presents the value —
          // combining them has no use case and every combination would
          // need teaching forever.
          const transform = activeTransform(value);
          const hasMap = transform === "map";
          const hasPrefix = transform === "prefix";
          const hasFormat = transform === "format";
          if (transform === "conflict") {
            return nodeError(
              `Attribute '${name}' carries more than one of 'map', 'prefix' and 'format' — one transform per value.`,
              attrPath
            );
          }
          if (hasMap) {
            if (
              !isPlainObject(value.map) ||
              Object.values(value.map).some((entry) => typeof entry !== "string")
            ) {
              return nodeError(
                `Attribute '${name}': 'map' must be an object of string values.`,
                attrPath
              );
            }
            if (value.default !== undefined && typeof value.default !== "string") {
              return nodeError(
                `Attribute '${name}': 'default' must be a string.`,
                attrPath
              );
            }
          } else if (value.default !== undefined) {
            return nodeError(
              `Attribute '${name}': 'default' requires 'map'.`,
              attrPath
            );
          }
          if (hasPrefix && typeof value.prefix !== "string") {
            return nodeError(
              `Attribute '${name}': 'prefix' must be a string.`,
              attrPath
            );
          }
          if (hasFormat) {
            const formatError = checkFormat(value.format, `Attribute '${name}'`, attrPath);
            if (formatError) return formatError;
          }
          continue;
        }
        return nodeError(
          `Attribute '${name}' must be a string, { bind }, { bind, map, default? }, { bind, prefix } or { bind, format } value.`,
          attrPath
        );
      }
    }
    if ("action" in node && node.action !== undefined) {
      // An element is a link OR an action — both would leave the bridge
      // guessing which the author meant.
      const hasHref =
        isPlainObject(node.attrs) &&
        Object.keys(node.attrs).some((name) => name.toLowerCase() === "href");
      if (hasHref) {
        return {
          code: "CONFLICTING_ATTRIBUTES",
          message: "An element carries 'href' or an 'action' binding, never both.",
          path
        };
      }
      const actionError = validateActionBinding(node.action, join(path, "action"), {
        isPath: (value) => parsePath(value) !== undefined
      });
      if (actionError) {
        return { code: "INVALID_ACTION", message: actionError.message, path: actionError.path };
      }
    }
    if ("children" in node && node.children !== undefined) {
      if (!Array.isArray(node.children)) {
        return nodeError("'children' must be an array.", path);
      }
      for (let i = 0; i < node.children.length; i++) {
        const childError = check(
          node.children[i],
          join(path, `children.${i}`),
          depth + 1
        );
        if (childError) return childError;
      }
    }
    return undefined;
  }

  return nodeError(
    "Unknown template node form (expected text, bind, tag, each, or when).",
    path
  );
}

/** Validate an unknown value as a widget template. Never throws. */
export function validateTemplate(input: unknown): ValidateTemplateResult {
  const error = check(input, "", 0);
  if (error) return { ok: false, error };
  return { ok: true, template: input as WidgetTemplate };
}

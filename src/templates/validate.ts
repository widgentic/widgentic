import type { TemplateError, WidgetTemplate } from "./types.js";
import { FORBIDDEN_ATTR, MAX_TEMPLATE_DEPTH, RESERVED_ATTR } from "./guards.js";
import { parsePath } from "./paths.js";
import { validateActionBinding } from "../actions/validate.js";

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function join(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
}

function nodeError(message: string, path: string): TemplateError {
  return { code: "INVALID_TEMPLATE_NODE", message, path };
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
    return checkPathSyntax(node.bind, path);
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
    if ("attrs" in node && node.attrs !== undefined) {
      if (!isPlainObject(node.attrs)) {
        return nodeError("'attrs' must be an object.", path);
      }
      for (const [name, value] of Object.entries(node.attrs)) {
        const attrPath = join(path, `attrs.${name}`);
        if (FORBIDDEN_ATTR.test(name)) {
          return {
            code: "FORBIDDEN_ATTRIBUTE",
            message: `Event-handler attribute '${name}' is not allowed in templates.`,
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
          // prefix glues one in front — combining them has no use case
          // and every combination would need teaching forever.
          const hasMap = value.map !== undefined;
          const hasPrefix = value.prefix !== undefined;
          if (hasMap && hasPrefix) {
            return nodeError(
              `Attribute '${name}' carries both 'map' and 'prefix' — one transform per value.`,
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
          continue;
        }
        return nodeError(
          `Attribute '${name}' must be a string, { bind }, { bind, map, default? } or { bind, prefix } value.`,
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

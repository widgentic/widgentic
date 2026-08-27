/**
 * The action model: what a widget can ask for when a person activates a
 * bound element. Two kinds — `prompt` proposes a user message through the
 * host, `http` performs a server-side request against an author-declared
 * URL — both plain JSON data, storable and validatable, never code.
 *
 * Zero-dependency by design: this module is shared by the template
 * compiler (which resolves bindings into descriptors at render time), the
 * store (which validates stored actions), the server (which executes) and
 * the designers (which edit).
 */
import type { DataSchema } from "../catalog/index.js";

/** A prompt's text: literals and `{ bind }` segments resolved at render time. */
export type PromptSegment = string | { bind: string };

export interface PromptActionDefinition {
  kind: "prompt";
  text: PromptSegment[];
}

/** A by-name reference to one of the principal's secrets. */
export interface SecretRef {
  secret: string;
}

/** Header and query values: author literals or secret references. */
export type HeaderValue = string | SecretRef;

export type HttpMethod = "GET" | "POST";

export interface HttpActionDefinition {
  kind: "http";
  method: HttpMethod;
  /** Absolute https URL, fixed by the author — bindings never reach it. */
  url: string;
  /** JSON Schema (`type: "object"`) of the arguments. */
  input: DataSchema;
  /** JSON Schema the response body must satisfy. */
  output: DataSchema;
  headers?: Record<string, HeaderValue>;
  query?: Record<string, HeaderValue>;
}

export type ActionDefinition = PromptActionDefinition | HttpActionDefinition;

/** A shared, named action a principal owns. */
export interface StoredAction {
  name: string;
  label?: string;
  description?: string;
  definition: ActionDefinition;
}

/** Input mapping: input-schema field → template path or literal. */
export type InputMapping = Record<string, string | { const: unknown }>;

export type OutputMode = "replace" | "merge" | "patch";

export interface OutputBinding {
  /** Default `merge`. */
  mode?: OutputMode;
  /** Required for `patch`: the dotted data path the response is written at. */
  path?: string;
  /** Projection applied first: target data path → source response path. */
  map?: Record<string, string>;
}

/**
 * A binding names an action — a shared one by `ref`, or an inline one
 * under `definition` (nested so the definition's `input`/`output` schemas
 * never collide with the binding's `input` mapping and `output` mode) —
 * plus how data flows.
 */
export type ActionBinding = ({ ref: string } | { definition: ActionDefinition }) & {
  input?: InputMapping;
  output?: OutputBinding;
};

/** Why an action renders unavailable. */
export type ActionDisabledReason = "scope" | "unresolved";

/**
 * What a rendered element carries in `data-wg-action`: everything the
 * bridge needs, nothing it must evaluate.
 */
export interface ActionDescriptor {
  /** Binding identifier: the element's dotted template path, or "load". */
  id: string;
  kind?: ActionDefinition["kind"];
  /** Resolved http arguments. */
  args?: Record<string, unknown>;
  /** Resolved prompt text. */
  text?: string;
  disabled?: ActionDisabledReason;
  /** The kind whose template declared the binding (set when registered). */
  widget?: string;
  /**
   * Inside a `group` render: the dotted path of the item payload within the
   * root payload (e.g. `data.items.2`), stamped by the group composition.
   */
  at?: string;
}

/** Structured validation error; `path` is dotted, relative to the caller's root. */
export interface ActionError {
  code: "INVALID_ACTION";
  message: string;
  path: string;
}

/** Upper bound on a resolved prompt message. */
export const PROMPT_TEXT_MAX = 2_000;

/** Secret names: short, lowercase, URL- and header-safe. */
export const SECRET_NAME = /^[a-z][a-z0-9-]{0,63}$/;

/** Action names share the secret-name discipline. */
export const ACTION_NAME = SECRET_NAME;

export const OUTPUT_MODES: readonly OutputMode[] = ["replace", "merge", "patch"];

export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST"];

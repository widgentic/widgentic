/**
 * The shapes this package shares with hosts: the WebMCP tool descriptor (a
 * duck-typed subset of the spec's `ModelContextTool`, so no vendor typings are
 * required), the model-context surface it registers on, and the designer
 * sources a host hands over.
 */
import type {
  ActionDesignerHandle,
  DesignerHandle,
  SchemaDesignerHandle,
  ThemeDesignerHandle
} from "@widgentic/designer";

export interface WebMcpToolAnnotations {
  /** The tool changes nothing — agents may run it without a confirmation step. */
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface WebMcpTextContent {
  type: "text";
  text: string;
}

/** Every widgentic tool resolves to MCP-shaped text content carrying a JSON document. */
export interface WebMcpToolResult {
  content: WebMcpTextContent[];
}

export interface WebMcpExecuteOptions {
  signal?: AbortSignal;
}

export interface WebMcpTool {
  name: string;
  /** Short human label — browsers list it in their "site tools" UI. */
  title?: string;
  description: string;
  /** JSON Schema for the arguments; every widgentic tool's is a closed object schema. */
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
  execute(input: unknown, options?: WebMcpExecuteOptions): Promise<WebMcpToolResult>;
}

/**
 * The part of `document.modelContext` / `navigator.modelContext` this package
 * uses. `registerTool` may return a promise (the spec) or nothing (early
 * builds); `unregisterTool` exists only on builds that pre-date the abort
 * signal option.
 */
export interface ModelContextLike {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): unknown;
  unregisterTool?(name: string): unknown;
}

/**
 * Getters, not handles: hosts remount designers (tab switches), so each call
 * resolves the CURRENT handle. A getter may do work — open the section that
 * mounts the designer — and may return nothing, which the tools report as
 * `NOT_MOUNTED`.
 */
export interface DesignerSources {
  widget?: () => DesignerHandle | undefined;
  theme?: () => ThemeDesignerHandle | undefined;
  schema?: () => SchemaDesignerHandle | undefined;
  action?: () => ActionDesignerHandle | undefined;
}

export interface ToolsOptions {
  /** Tool-name prefix (`<prefix>_widget_draft_get`, …). Default `widgentic`. */
  prefix?: string;
}

export interface RegisterOptions {
  /** Explicit model context; wins over feature detection (tests, polyfills). */
  modelContext?: ModelContextLike;
  /** A host signal that also disposes the registration when aborted. */
  signal?: AbortSignal;
}

export interface ExposeOptions extends ToolsOptions, RegisterOptions {
  /** Extra host tools registered under the same signal and reported in the same result. */
  tools?: WebMcpTool[];
}

export interface RegisterFailure {
  name: string;
  message: string;
}

export interface RegisterResult {
  /** False when the page has no model context: nothing was registered, nothing threw. */
  supported: boolean;
  registered: string[];
  failed: RegisterFailure[];
  /** Aborts the signal (and unregisters by name where the context supports it); idempotent. */
  dispose(): void;
}

export interface ExposeResult extends RegisterResult {
  /** The descriptors that were offered, registered or not. */
  tools: WebMcpTool[];
}

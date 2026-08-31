/**
 * Typed browser client for the authoring surface (`@widgentic/mcp/authoring`)
 * — the routes an example host mounts under `/api`. One copy, shared, so two
 * example clients cannot drift on paths or shapes. Types come from
 * `@widgentic/core` (browser-safe) plus the surface's own response shapes;
 * nothing from `@widgentic/mcp` is imported at runtime.
 *
 * A refusal carries the store's own rule: `{ error: { code, message } }`
 * becomes an `AuthoringApiError` with that code, so a caller can show the
 * rule instead of a generic failure.
 */
import type { StoredAction, ThemeEntry } from "@widgentic/core";
// Type-only imports, erased at bundle time: the browser bundle stays free of
// the Node-only package while the client stays typed against the very shapes
// the authoring surface serializes.
import type { TestActionResult } from "@widgentic/mcp";
import type { SecretEntry, StoredKey, StoredSchema, StoredWidget } from "@widgentic/mcp/store";

export type WidgetEntry = StoredWidget;
export type SchemaEntry = StoredSchema;
export type KeyEntry = StoredKey;
export type { SecretEntry };
export type ActionTestResult = TestActionResult;

export interface CreatedKey {
  key: string;
  entry: KeyEntry;
  notice: string;
}

export interface Me {
  principal: { id: string; label?: string };
  secretsEnabled: boolean;
}

export class AuthoringApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AuthoringApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, init);
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new AuthoringApiError(error?.code ?? "UNKNOWN", error?.message ?? `HTTP ${response.status}`, response.status);
  }
  return body as T;
}

const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

export const authoringClient = {
  me: () => call<Me>("me"),

  listWidgets: () => call<{ widgets: WidgetEntry[] }>("widgets").then((r) => r.widgets),
  saveWidget: (entry: WidgetEntry) =>
    call(`widgets/${encodeURIComponent(entry.kind)}`, put({
      template: entry.template,
      descriptor: entry.descriptor,
      ...(entry.load === undefined ? {} : { load: entry.load })
    })),
  removeWidget: (kind: string) => call(`widgets/${encodeURIComponent(kind)}`, { method: "DELETE" }),

  listThemes: () => call<{ themes: ThemeEntry[] }>("themes").then((r) => r.themes),
  saveTheme: (entry: ThemeEntry) => call(`themes/${encodeURIComponent(entry.name)}`, put(entry)),
  removeTheme: (name: string) => call(`themes/${encodeURIComponent(name)}`, { method: "DELETE" }),

  listSchemas: () => call<{ schemas: SchemaEntry[] }>("schemas").then((r) => r.schemas),
  saveSchema: (entry: SchemaEntry) => call(`schemas/${encodeURIComponent(entry.name)}`, put(entry)),
  removeSchema: (name: string) => call(`schemas/${encodeURIComponent(name)}`, { method: "DELETE" }),

  listActions: () => call<{ actions: StoredAction[] }>("actions").then((r) => r.actions),
  saveAction: (entry: StoredAction) => call(`actions/${encodeURIComponent(entry.name)}`, put(entry)),
  removeAction: (name: string) => call(`actions/${encodeURIComponent(name)}`, { method: "DELETE" }),
  testAction: (definition: unknown, args: Record<string, unknown>) =>
    call<ActionTestResult>("action-test", { method: "POST", body: JSON.stringify({ definition, args }) }),

  listSecrets: () => call<{ enabled: boolean; secrets: SecretEntry[] }>("secrets"),
  saveSecret: (name: string, value: string) => call(`secrets/${encodeURIComponent(name)}`, put({ value })),
  removeSecret: (name: string) => call(`secrets/${encodeURIComponent(name)}`, { method: "DELETE" }),

  listKeys: () => call<{ keys: KeyEntry[] }>("keys").then((r) => r.keys),
  createKey: (name: string, scopes?: string[]) =>
    call<CreatedKey>("keys", { method: "POST", body: JSON.stringify({ name, ...(scopes === undefined ? {} : { scopes }) }) }),
  revokeKey: (id: string) => call(`keys/${encodeURIComponent(id)}`, { method: "DELETE" })
};

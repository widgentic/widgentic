/**
 * The MCP server one request gets, for the principal its key resolved to:
 * the catalog, themes and resource domains composed from the store with no
 * cache, so one principal's entries never reach another's session. The
 * settings are read once and serve the default themes, the declared domains
 * and the stylesheets alike. Kept apart from `mcp.ts`, which listens when imported, so
 * the composition is testable.
 */
import { createWidgenticServer } from "@widgentic/mcp/sdk";
import {
  composeCatalog,
  composeResourceDomains,
  composeResources,
  composeThemes,
  readPrincipalSettings
} from "@widgentic/mcp/store";
import type { Principal, WidgetStore } from "@widgentic/mcp/store";

/** A per-principal rate gate (`false` = limited). */
export interface PrincipalGate {
  take(principalId: string): boolean;
}

export async function serverForPrincipal(
  store: WidgetStore,
  principal: Principal,
  gates: { execute: PrincipalGate; preview: PrincipalGate },
  log: (line: string) => void = (line) => console.error(line)
): Promise<ReturnType<typeof createWidgenticServer>> {
  const executeAllowed = principal.scopes.includes("execute");
  const settings = readPrincipalSettings(store, principal.id);
  const [catalogResult, themeResult, domainResult, resourceResult] = await Promise.all([
    composeCatalog(store, principal.id, { executeAllowed }),
    composeThemes(store, principal.id, { settings }),
    composeResourceDomains(store, principal.id, { settings }),
    composeResources(store, principal.id, { settings })
  ]);
  for (const diagnostic of [
    ...catalogResult.diagnostics,
    ...themeResult.diagnostics,
    ...domainResult.diagnostics,
    ...resourceResult.diagnostics
  ]) {
    log(`widgentic store [${principal.id}]: ${diagnostic}`);
  }
  return createWidgenticServer({
    catalog: catalogResult.value,
    themes: themeResult.value,
    ...(catalogResult.actions === undefined ? {} : { actions: catalogResult.actions }),
    schemas: () => store.schemas(principal.id),
    sharedActions: () => store.actions(principal.id),
    secrets: (name: string) => store.secretValue(principal.id, name),
    scopes: principal.scopes,
    rateLimit: () => gates.execute.take(principal.id),
    previewRateLimit: () => gates.preview.take(principal.id),
    // The principal's own domains, declared on the app resource for its frames.
    resourceDomains: domainResult.value,
    // Their stylesheets, which those domains cover (the store refuses any other).
    resources: resourceResult.value
  });
}

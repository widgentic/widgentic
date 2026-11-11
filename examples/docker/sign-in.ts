/**
 * Signing MCP hosts in: `@widgentic/mcp/oauth`'s authorization surface over
 * this deployment's store, with this deployment's identity mode as "who is
 * signed in" — wiring only, apart from `web.ts` (which listens when
 * imported) so it is testable.
 *
 * The single principal is always signed in, so a host lands on the consent
 * page directly. Behind a trusted header the header's subject is signed in,
 * and a request without it is offered only the anonymous choice: there is no
 * sign-in page of ours to send it to.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { AUTHORIZATION_PATHS, createAuthorizationHttpHandler } from "@widgentic/mcp/oauth";
import type { WritableAccessGrantStore, WritableWidgetStore } from "@widgentic/mcp/store";
import type { Identity } from "./identity.js";
import { oauthOrigins, oauthSecret } from "./oauth-config.js";
import type { OAuthOrigins } from "./oauth-config.js";

export interface SignIn {
  origins: OAuthOrigins;
  /** Answers `true` when the request was one of the surface's routes. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /**
   * Whether `path` is called by MCP hosts and their browser clients from
   * other origins. They carry no ambient credential of the app's page, so
   * the app's cross-site guard has nothing to protect on them — unlike the
   * consent form's POST, which is not one of these.
   */
  crossOrigin(path: string): boolean;
}

export function createSignIn(
  store: WritableWidgetStore & WritableAccessGrantStore,
  identity: Identity,
  env: Record<string, string | undefined>,
  log: (line: string) => void = (line) => console.error(line)
): SignIn {
  const origins = oauthOrigins(env);
  const handle = createAuthorizationHttpHandler(
    { issuer: origins.issuer, resources: [origins.resource], secret: oauthSecret(env, log), store, log },
    async (req) => {
      const context = await identity.resolve(req);
      return context === undefined
        ? undefined
        : { principalId: context.principalId, ...(context.label === undefined ? {} : { label: context.label }) };
    }
  );
  const crossOriginRoutes: readonly string[] = [
    AUTHORIZATION_PATHS.metadata,
    AUTHORIZATION_PATHS.register,
    AUTHORIZATION_PATHS.token,
    AUTHORIZATION_PATHS.revoke
  ];
  return { origins, handle, crossOrigin: (path) => crossOriginRoutes.includes(path) };
}

/**
 * Identity without an identity provider (self-host-example spec).
 *
 * Two modes, chosen by configuration:
 *   - Default: one fixed principal, no sign-in. The deployment belongs on
 *     localhost or a trusted network, and the trusted header below is never
 *     read — a spoofed header changes nothing.
 *   - `WIDGENTIC_TRUSTED_USER_HEADER=<name>`: multi-user behind an auth
 *     proxy (oauth2-proxy, Cloudflare Access, Authelia, Tailscale Serve).
 *     The named header's value becomes the identity subject, namespaced
 *     `proxy:` so it can never collide with a subject another identity
 *     source minted. FAIL CLOSED: once configured, a request without the
 *     header is refused rather than served the default principal — a proxy
 *     that stops sending it must not merge everyone into one account. The
 *     proxy MUST strip this header from inbound client requests.
 */
import type { IncomingMessage } from "node:http";
import type { PrincipalContext } from "@widgentic/mcp/authoring";
import type { WritableWidgetStore } from "@widgentic/mcp/store";

export interface Identity {
  mode: "single" | "trusted-header";
  resolve(req: IncomingMessage): Promise<PrincipalContext | undefined>;
}

export async function createIdentity(store: WritableWidgetStore): Promise<Identity> {
  const headerName = process.env.WIDGENTIC_TRUSTED_USER_HEADER?.toLowerCase();

  if (headerName === undefined || headerName === "") {
    // No subject in the context: the identity routes (linked accounts) do
    // not exist in this mode, by construction.
    const local = await store.ensurePrincipal("local:default", "Self-hosted");
    console.error("widgentic web: single-principal mode (no sign-in) — for localhost or a trusted network");
    return {
      mode: "single",
      resolve: async () => ({ principalId: local.id, label: "Self-hosted" })
    };
  }

  console.error(`widgentic web: multi-user mode — identity from the '${headerName}' header (fails closed without it)`);
  return {
    mode: "trusted-header",
    resolve: async (req) => {
      const value = req.headers[headerName];
      const user = typeof value === "string" ? value.trim() : "";
      if (user === "") return undefined; // configured but absent: refuse
      const subject = `proxy:${user}`;
      const principal = await store.ensurePrincipal(subject, user);
      return { principalId: principal.id, subject, label: user };
    }
  };
}

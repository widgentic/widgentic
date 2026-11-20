/**
 * The resource side of MCP authorization: what a protected MCP endpoint
 * serves and says so a host can find where to sign in, and the rule by
 * which it accepts a credential or challenges. Functions over plain values
 * and the caller's own resolvers — no request object, no store, no
 * environment.
 */

/** The OAuth scopes, one to one with the store's key-grantable scopes. */
export const OAUTH_SCOPES = ["read", "execute"] as const;

const WELL_KNOWN = "/.well-known/oauth-protected-resource";

export interface ProtectedResource {
  /** The protected endpoint's public URL — the identifier tokens are issued for. */
  resource: string;
  /** Issuer URLs of the authorization servers that issue tokens for it. */
  authorizationServers: readonly string[];
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

/** The RFC 9728 document for a resource. */
export function protectedResourceMetadata(options: ProtectedResource): ProtectedResourceMetadata {
  return {
    resource: options.resource,
    authorization_servers: [...options.authorizationServers],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"]
  };
}

/**
 * The paths the metadata is served at on the resource's origin: the
 * path-specific form first (`/.well-known/oauth-protected-resource/mcp`),
 * then the root form. Hosts differ in which they try, so serve both.
 */
export function protectedResourceMetadataPaths(resource: string): string[] {
  const path = new URL(resource).pathname.replace(/\/+$/, "");
  return path === "" ? [WELL_KNOWN] : [`${WELL_KNOWN}${path}`, WELL_KNOWN];
}

/** The metadata's public URL — what a challenge points at. */
export function protectedResourceMetadataUrl(resource: string): string {
  return new URL(protectedResourceMetadataPaths(resource)[0] ?? WELL_KNOWN, resource).toString();
}

export interface BearerChallenge {
  resourceMetadataUrl: string;
  /** True when the request presented a bearer token that was refused. */
  invalidToken?: boolean;
}

/** The `WWW-Authenticate` value of a 401 from a protected endpoint. */
export function bearerChallenge(challenge: BearerChallenge): string {
  const quoted = challenge.resourceMetadataUrl.replace(/[\\"]/g, "\\$&");
  return `Bearer resource_metadata="${quoted}"${challenge.invalidToken === true ? ', error="invalid_token"' : ""}`;
}

/**
 * The token of an `Authorization: Bearer …` value. Nothing for another
 * scheme, an empty token or a malformed value — never an error.
 */
export function readBearerToken(header: string | null | undefined): string | undefined {
  if (typeof header !== "string") return undefined;
  const match = /^bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(header.trim());
  return match?.[1];
}

/** What a request to a protected endpoint presented, as the edge read it. */
export interface PresentedCredential {
  /** The `x-api-key` header or the `key` query parameter. */
  apiKey?: string | null | undefined;
  /** The raw `Authorization` header value. */
  authorization?: string | null | undefined;
}

export interface CredentialResolvers<P> {
  /** The protected endpoint's public URL; tokens must have been issued for it. */
  resource: string;
  resolveKey(apiKey: string): P | undefined | Promise<P | undefined>;
  resolveToken(token: string, options: { resource: string }): P | undefined | Promise<P | undefined>;
}

export type CredentialOutcome<P> =
  | { principal: P; via: "key" | "token" }
  /** Nothing resolved: answer 401 with this `WWW-Authenticate` value. */
  | { challenge: string; presented: "none" | "key" | "token" };

/**
 * The protected endpoint's rule in one place: an API key decides when one is
 * presented, otherwise a bearer token does, and anything that resolves to
 * nobody — or nothing presented at all — is a challenge, never a catalog.
 */
export async function resolveCredential<P>(
  presented: PresentedCredential,
  resolvers: CredentialResolvers<P>
): Promise<CredentialOutcome<P>> {
  const resourceMetadataUrl = protectedResourceMetadataUrl(resolvers.resource);
  if (typeof presented.apiKey === "string" && presented.apiKey !== "") {
    const principal = await resolvers.resolveKey(presented.apiKey);
    return principal === undefined
      ? { challenge: bearerChallenge({ resourceMetadataUrl }), presented: "key" }
      : { principal, via: "key" };
  }
  const token = readBearerToken(presented.authorization);
  if (token === undefined) return { challenge: bearerChallenge({ resourceMetadataUrl }), presented: "none" };
  const principal = await resolvers.resolveToken(token, { resource: resolvers.resource });
  return principal === undefined
    ? { challenge: bearerChallenge({ resourceMetadataUrl, invalidToken: true }), presented: "token" }
    : { principal, via: "token" };
}

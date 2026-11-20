/**
 * widgentic/oauth — signing MCP hosts in. The resource side: the metadata
 * document, the challenge and bearer extraction a protected MCP endpoint
 * needs. The authorization surface: metadata, client registration, the
 * authorize and consent step, tokens and revocation, as a function over
 * decoded requests with a node adapter beside it. The host says who is
 * signed in; the surface binds the connecting application to one of that
 * person's API keys.
 */
export {
  OAUTH_SCOPES,
  bearerChallenge,
  protectedResourceMetadata,
  protectedResourceMetadataPaths,
  protectedResourceMetadataUrl,
  readBearerToken,
  resolveCredential
} from "./resource.js";
export type {
  BearerChallenge,
  CredentialOutcome,
  CredentialResolvers,
  PresentedCredential,
  ProtectedResource,
  ProtectedResourceMetadata
} from "./resource.js";
export {
  ANONYMOUS_CODE_PREFIX,
  AUTHORIZATION_PATHS,
  DECISION_SECONDS,
  authorizationServerMetadata,
  createAuthorizationSurface
} from "./handler.js";
export type { AuthorizationServerMetadata, AuthorizationSurface } from "./handler.js";
export { createAuthorizationHttpHandler } from "./node.js";
export type { AuthorizationHttpOptions } from "./node.js";
export { MAX_REDIRECT_URIS, REGISTERED_CLIENT_PREFIX } from "./clients.js";
export { PAGE_ASSET_KINDS } from "./types.js";
export type {
  AuthorizationDeps,
  AuthorizationPage,
  AuthorizationRequest,
  AuthorizationResponse,
  PageAssetKind,
  ResolveSignedIn,
  SignInLink,
  SignedInPrincipal
} from "./types.js";

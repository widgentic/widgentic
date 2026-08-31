/**
 * widgentic/authoring — the write side of the store port as a hostable HTTP
 * surface: widgets, themes, schemas, shared actions, write-only secrets and
 * API keys, authorized by the host's resolved principal and nothing else.
 * The core is a pure function over decoded requests; the node adapter beside
 * it mounts it on a standard server.
 */
export { handleAuthoringRequest, rejectionStatus } from "./handler.js";
export { createAuthoringHttpHandler } from "./node.js";
export type { AuthoringHttpOptions } from "./node.js";
export type {
  AuthoringDeps,
  AuthoringRequest,
  AuthoringResponse,
  PrincipalContext,
  ResolvePrincipalContext
} from "./types.js";

/**
 * The authoring surface's contract with its host (authoring-api spec).
 *
 * The surface begins where authentication ends: the host resolves WHO is
 * asking — by session, by a trusted proxy header, or not at all — and hands
 * the result in as a `PrincipalContext`. Nothing in a request's path, query
 * or body can name a different principal, and no identity, session or cookie
 * code exists on this side of the boundary.
 */
import type { IncomingMessage } from "node:http";
import type { ExecutionLimiter, GuardedFetchDeps } from "../server/index.js";
import type { WritableWidgetStore } from "../store/types.js";

/** The host's answer to "who is asking" — resolved before the surface runs. */
export interface PrincipalContext {
  /** The one principal every operation in the request addresses. */
  principalId: string;
  /**
   * The authenticated identity subject, when the host has one. Its presence
   * is what enables the identity routes (linked accounts); a host with no
   * identity concept omits it and those routes do not exist.
   */
  subject?: string;
  /** Display label the host knows the caller by. */
  label?: string;
}

/** A decoded request: what the core routes on. No transport objects here. */
export interface AuthoringRequest {
  method: string;
  /** Path relative to the mount, e.g. `widgets/report` or `keys`. */
  path: string;
  /** Parsed JSON body, `undefined` when none was sent. */
  body?: unknown;
  /**
   * The host's resolved principal; `undefined` answers `401 NO_PRINCIPAL`.
   * The API-key refusal fires first either way.
   */
  context?: PrincipalContext;
  /**
   * Whether the request presented a widgentic API key anywhere (header,
   * query, body field). A key never authorizes authoring: when set, the
   * answer is `401 KEY_NOT_A_SESSION` before any store access, valid and
   * invalid keys indistinguishable.
   */
  presentedApiKey?: boolean;
}

export interface AuthoringResponse {
  status: number;
  body: unknown;
}

export interface AuthoringDeps {
  store: WritableWidgetStore;
  /** Whether the store holds a secret cipher (the secrets surface is off otherwise). */
  secretsEnabled?: boolean;
  /** Execution budget shared with the MCP edge; test calls draw from the same bucket. */
  limiter?: ExecutionLimiter;
  /** Injectable transport for the action test call (tests). */
  fetchDeps?: GuardedFetchDeps;
  /** Sink for unexpected server-side failures (defaults to stderr); clients only ever see `INTERNAL`. */
  log?: (line: string) => void;
}

/** The node adapter's host callback: authenticate however you do, or refuse by returning undefined. */
export type ResolvePrincipalContext = (
  req: IncomingMessage
) => PrincipalContext | undefined | Promise<PrincipalContext | undefined>;

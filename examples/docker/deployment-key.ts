/**
 * The deployment key (self-host-example spec): one operator-supplied API key
 * that resolves to the single principal on every boot, so the hosts pointed
 * at this deployment keep working when an ephemeral store starts empty.
 *
 * It comes from a mounted file (`WIDGENTIC_DEFAULT_KEY_FILE`, preferred) or
 * a variable (`WIDGENTIC_DEFAULT_KEY`), must have the shape the stores mint
 * (`wgk_` + 64 hex), and is held only as its digest: a presented key is
 * compared in constant time, and neither value is ever stored or logged.
 * Its scopes come from `WIDGENTIC_DEFAULT_KEY_SCOPES` — read only unless the
 * operator names `execute` — through the same normalization keys get at
 * creation. It is meant for single-principal deployments: it always
 * resolves to that principal, never to a proxied user.
 */
import { readFileSync } from "node:fs";
import {
  hashKey,
  KEY_PREFIX,
  normalizeKeyScopes,
  principalIdForSubject,
  verifyKey
} from "@widgentic/mcp/store";
import type { Principal } from "@widgentic/mcp/store";
import { SINGLE_PRINCIPAL_SUBJECT } from "./identity.js";

export interface DeploymentKey {
  /** The single principal when `presented` is the deployment key, else undefined. */
  match(presented: string): Principal | undefined;
}

const KEY_SHAPE = new RegExp(`^${KEY_PREFIX}[0-9a-f]{64}$`);

export function loadDeploymentKey(
  env: Record<string, string | undefined>,
  log: (line: string) => void = (line) => console.error(line)
): DeploymentKey | undefined {
  const file = env.WIDGENTIC_DEFAULT_KEY_FILE?.trim() ?? "";
  let material: string;
  try {
    material = file !== "" ? readFileSync(file, "utf8").trim() : env.WIDGENTIC_DEFAULT_KEY?.trim() ?? "";
  } catch {
    log("widgentic mcp: deployment key file unreadable — no deployment key");
    return undefined;
  }
  if (material === "") return undefined;
  if (!KEY_SHAPE.test(material)) {
    log(`widgentic mcp: deployment key ignored — it must be ${KEY_PREFIX} followed by 64 hex characters`);
    return undefined;
  }

  let scopes: Principal["scopes"];
  const requested = (env.WIDGENTIC_DEFAULT_KEY_SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
  try {
    scopes = normalizeKeyScopes(requested);
  } catch {
    log("widgentic mcp: WIDGENTIC_DEFAULT_KEY_SCOPES names a scope keys cannot hold — the deployment key is read-only");
    scopes = normalizeKeyScopes([]);
  }

  const digest = hashKey(material);
  const principal: Principal = { id: principalIdForSubject(SINGLE_PRINCIPAL_SUBJECT), scopes };
  log(`widgentic mcp: deployment key configured (scopes: ${scopes.join(", ")})`);
  return {
    match: (presented) => (verifyKey(presented, digest) ? { ...principal, scopes: [...scopes] } : undefined)
  };
}

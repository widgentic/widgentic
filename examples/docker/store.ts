/**
 * Shared bootstrap for both services: the SQLite store on the mounted
 * volume, and the secret cipher from operator-supplied key material.
 *
 * The KEK is never generated here — a per-boot key would write records that
 * cannot be read back after a restart. Supply it once (see the README for
 * `generateLocalKek()`) as a mounted file (`WIDGENTIC_KEK_FILE`, preferred:
 * a docker secret or a chmod-600 file) or as `WIDGENTIC_KEK`. With neither,
 * the secrets surface is off and secret writes refuse with `NO_CIPHER` —
 * everything else works.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createLocalCipher } from "@widgentic/mcp/secrets";
import type { SecretCipher } from "@widgentic/mcp/secrets";
import { createSqliteStore } from "@widgentic/mcp/store/sqlite";
import type { WritableWidgetStore } from "@widgentic/mcp/store";

export interface Deployment {
  store: WritableWidgetStore & { close(): void };
  secretsEnabled: boolean;
}

function loadKek(service: string): SecretCipher | undefined {
  // A set-but-empty variable (a blank .env line) means "not configured",
  // never a crash, and never shadows the other channel.
  const file = process.env.WIDGENTIC_KEK_FILE?.trim();
  const env = process.env.WIDGENTIC_KEK?.trim();
  const material = file !== undefined && file !== "" ? readFileSync(file, "utf8").trim() : env;
  if (material === undefined || material === "") {
    console.error(`widgentic ${service}: no KEK configured — the secrets surface is off`);
    return undefined;
  }
  // createLocalCipher validates the shape; material itself is never printed.
  const cipher = createLocalCipher(material);
  console.error(
    `widgentic ${service}: secrets use the local cipher (KEK from ${file !== undefined && file !== "" ? "file" : "environment"})`
  );
  return cipher;
}

export function openDeployment(service: string): Deployment {
  const dbPath = process.env.WIDGENTIC_DB ?? "/data/widgentic.db";
  mkdirSync(dirname(dbPath), { recursive: true });
  const cipher = loadKek(service);
  const store = createSqliteStore(dbPath, cipher === undefined ? {} : { cipher });
  console.error(`widgentic ${service}: SQLite store at ${dbPath}`);
  // The cipher handle stays here: consumers get the store and a flag, not
  // an object that key material could travel out through.
  return { store, secretsEnabled: cipher !== undefined };
}

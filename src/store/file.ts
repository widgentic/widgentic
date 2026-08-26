/**
 * File-backed reference store — what the demo rig and a single-node
 * deployment can use before a database exists.
 *
 * Layout:
 *   <dir>/principals.json                  [{ id, label?, scopes, keyDigest }]
 *   <dir>/<principalId>/widgets/<kind>.json
 *   <dir>/<principalId>/themes/<name>.json
 *   <dir>/<principalId>/schemas/<name>.json
 *   <dir>/<principalId>/actions/<name>.json
 *   <dir>/<principalId>/secrets/<name>.json   (envelope records — ciphertext only)
 *
 * NOT transactional and not concurrency-safe: two writers can interleave.
 * That is acceptable for a reference implementation; the app's adapter
 * owns transactional semantics. Missing paths read as empty rather than
 * erroring, so a partially-provisioned store still serves.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ThemeEntry } from "widgentic/theming";
import type { StoredAction } from "widgentic/actions";
import { decryptSecret } from "widgentic/secrets";
import type { SecretCipher } from "widgentic/secrets";
import { findByKey } from "./keys.js";
import type {
  Principal,
  SecretEntry,
  StoreLimits,
  StoredSchema,
  StoredSecret,
  StoredWidget,
  WidgetStore
} from "./types.js";
import { DEFAULT_LIMITS, StoreRejectionError } from "./types.js";
import {
  checkStoredAction,
  checkStoredSchema,
  checkStoredTheme,
  checkStoredWidget
} from "./validate.js";

interface PrincipalRow extends Principal {
  keyDigest: string;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function readDirJson(dir: string): Promise<unknown[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return []; // absent directory is an empty collection, not an error
  }
  const out: unknown[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const value = await readJson(join(dir, name));
    if (value !== undefined) out.push(value);
  }
  return out;
}

export interface FileStoreOptions {
  limits?: StoreLimits;
  /** Report entries the store refuses to serve (defaults to stderr). */
  onDiagnostic?: (message: string) => void;
  /** Enables `secretValue`; without it the store refuses with `NO_CIPHER`. */
  cipher?: SecretCipher;
}

export function createFileStore(
  dir: string,
  options: FileStoreOptions = {}
): WidgetStore & { seedPrincipal(row: PrincipalRow): Promise<void> } {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const report =
    options.onDiagnostic ??
    ((message: string) => console.error(`widgentic store: ${message}`));

  async function principals(): Promise<PrincipalRow[]> {
    const rows = await readJson(join(dir, "principals.json"));
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row): row is PrincipalRow =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as PrincipalRow).id === "string" &&
        typeof (row as PrincipalRow).keyDigest === "string"
    );
  }

  /** Path traversal guard: ids address directories, so constrain them. */
  function safeId(principalId: string): string | undefined {
    return /^[a-zA-Z0-9._-]+$/.test(principalId) ? principalId : undefined;
  }

  return {
    async resolvePrincipal(apiKey) {
      if (typeof apiKey !== "string" || apiKey === "") return undefined;
      const row = findByKey(apiKey, await principals());
      if (row === undefined) return undefined;
      const { keyDigest: _digest, ...principal } = row;
      return principal;
    },

    async widgets(principalId) {
      const id = safeId(principalId);
      if (id === undefined) return [];
      const entries = await readDirJson(join(dir, id, "widgets"));
      const out: StoredWidget[] = [];
      for (const entry of entries) {
        const problem = checkStoredWidget(entry, limits);
        if (problem) {
          // Skip, never throw: one bad file must not deny a principal
          // their remaining widgets, and must never reach a catalog.
          report(
            `skipped a widget for '${id}': ${problem.code} — ${problem.message}`
          );
          continue;
        }
        out.push(entry as StoredWidget);
      }
      return out.slice(0, limits.maxWidgets);
    },

    async themes(principalId) {
      const id = safeId(principalId);
      if (id === undefined) return [];
      const entries = await readDirJson(join(dir, id, "themes"));
      const out: ThemeEntry[] = [];
      for (const entry of entries) {
        const problem = checkStoredTheme(entry, limits);
        if (problem) {
          report(`skipped a theme for '${id}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as ThemeEntry);
      }
      return out.slice(0, limits.maxThemes);
    },

    async schemas(principalId) {
      const id = safeId(principalId);
      if (id === undefined) return [];
      const entries = await readDirJson(join(dir, id, "schemas"));
      const out: StoredSchema[] = [];
      for (const entry of entries) {
        const problem = checkStoredSchema(entry, limits);
        if (problem) {
          report(`skipped a schema for '${id}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as StoredSchema);
      }
      return out.slice(0, limits.maxSchemas);
    },

    async actions(principalId) {
      const id = safeId(principalId);
      if (id === undefined) return [];
      const entries = await readDirJson(join(dir, id, "actions"));
      const out: StoredAction[] = [];
      for (const entry of entries) {
        const problem = checkStoredAction(entry, limits);
        if (problem) {
          report(`skipped an action for '${id}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as StoredAction);
      }
      return out.slice(0, limits.maxActions);
    },

    async listSecrets(principalId) {
      const id = safeId(principalId);
      if (id === undefined) return [];
      const out: SecretEntry[] = [];
      for (const entry of await readDirJson(join(dir, id, "secrets"))) {
        const stored = entry as Partial<StoredSecret>;
        if (typeof stored.name !== "string" || typeof stored.record !== "object") {
          report(`skipped a malformed secret record for '${id}'.`);
          continue;
        }
        out.push({
          name: stored.name,
          createdAt: typeof stored.createdAt === "string" ? stored.createdAt : "",
          updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : ""
        });
      }
      return out.slice(0, limits.maxSecrets);
    },

    async secretValue(principalId, name) {
      if (options.cipher === undefined) {
        throw new StoreRejectionError("NO_CIPHER", "this store was built without a secret cipher.");
      }
      const id = safeId(principalId);
      if (id === undefined || !/^[a-z][a-z0-9-]{0,63}$/.test(name)) return undefined;
      const stored = (await readJson(join(dir, id, "secrets", `${name}.json`))) as
        | Partial<StoredSecret>
        | undefined;
      if (stored === undefined || stored.record === undefined) return undefined;
      return decryptSecret(stored.record, options.cipher);
    },

    /** Provisioning helper for the rig; the app owns its own write path. */
    async seedPrincipal(row) {
      await mkdir(dir, { recursive: true });
      const existing = await principals();
      const next = [...existing.filter((r) => r.id !== row.id), row];
      await writeFile(join(dir, "principals.json"), JSON.stringify(next, null, 2));
      const id = safeId(row.id);
      if (id !== undefined) {
        await mkdir(join(dir, id, "widgets"), { recursive: true });
        await mkdir(join(dir, id, "themes"), { recursive: true });
        await mkdir(join(dir, id, "schemas"), { recursive: true });
        await mkdir(join(dir, id, "actions"), { recursive: true });
        await mkdir(join(dir, id, "secrets"), { recursive: true });
      }
    }
  };
}

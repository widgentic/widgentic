/**
 * File-backed reference store — what the demo rig and a single-node
 * deployment can use before a database exists.
 *
 * Layout:
 *   <dir>/principals.json                  [{ id, label?, scopes, keyDigest }]
 *   <dir>/<principalId>/widgets/<kind>.json
 *   <dir>/<principalId>/themes/<name>.json
 *
 * NOT transactional and not concurrency-safe: two writers can interleave.
 * That is acceptable for a reference implementation; the app's adapter
 * owns transactional semantics. Missing paths read as empty rather than
 * erroring, so a partially-provisioned store still serves.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ThemeEntry } from "widgentic/theming";
import { findByKey } from "./keys.js";
import type {
  Principal,
  StoreLimits,
  StoredWidget,
  WidgetStore
} from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";
import { checkStoredTheme, checkStoredWidget } from "./validate.js";

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
      }
    }
  };
}

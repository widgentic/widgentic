/**
 * Cosmos DB adapter for the widgentic store port — the port's first real
 * database implementation. Ships from its own entry (`widgentic/store/cosmos`)
 * so `widgentic/store` keeps its no-network, zero-dependency property;
 * `@azure/cosmos` and `@azure/identity` are optional peer dependencies that
 * only hosts importing this entry install.
 *
 * Layout (design D3):
 *   - `data` container, partition key `/principalId`:
 *       id "profile"        → { principalId, subject, label?, scopes }
 *       id "widget:<kind>"  → { principalId, widget: StoredWidget }
 *       id "theme:<name>"   → { principalId, theme: ThemeEntry }
 *       id "schema:<name>"  → { principalId, schema: StoredSchema }
 *     Every read is a point read or a single-partition query.
 *   - `keys` container, partition key `/digest`, id = digest:
 *       { digest, principalId, keyId, name, scopes, createdAt, revokedAt? }
 *     `resolvePrincipal` is a 1-RU point read: the presented key is hashed
 *     and the digest is both id and partition key. The database compares
 *     digests as opaque keys, so lookup timing reveals nothing about the
 *     key material itself.
 *
 * Management-plane operations (`listKeys`, `revokeKey`) query the small
 * `keys` container across partitions; they are user-driven and rare, and
 * deliberately kept off the hot path rather than denormalized into `data`.
 *
 * Identity only (design D6): construction takes an endpoint plus an Azure
 * credential (managed identity in deployment, developer credential
 * locally). There is intentionally NO option carrying an account key or a
 * connection string. A deployment whose identity holds only the read role
 * gets service-enforced read-only behavior — writes fail at Cosmos, and
 * this adapter surfaces them as structured errors without credential
 * material.
 */
import { CosmosClient } from "@azure/cosmos";
import type { TokenCredential } from "@azure/identity";
import type { ThemeEntry } from "widgentic/theming";
import { generateKey, hashKey } from "./keys.js";
import type {
  CreatedKey,
  Principal,
  Scope,
  StoreLimits,
  StoredKey,
  StoredSchema,
  StoredWidget,
  WritableWidgetStore
} from "./types.js";
import {
  DEFAULT_LIMITS,
  principalIdForSubject,
  StoreRejectionError
} from "./types.js";
import { checkStoredSchema, checkStoredTheme, checkStoredWidget } from "./validate.js";

/* ------------------------------------------------------------------ */
/* Structural client types — satisfied by the real @azure/cosmos client
 * and by test fakes alike, so query shapes are assertable without a
 * database and the emulator can be wired with its own client.         */

export interface CosmosQuerySpec {
  query: string;
  parameters?: { name: string; value: string }[];
}

export interface CosmosQueryOptions {
  partitionKey?: string;
}

export interface CosmosItemLike {
  read(): Promise<{ statusCode: number; resource?: unknown }>;
  replace(doc: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface CosmosContainerLike {
  item(id: string, partitionKey: string): CosmosItemLike;
  items: {
    query(
      spec: CosmosQuerySpec,
      options?: CosmosQueryOptions
    ): { fetchAll(): Promise<{ resources: unknown[] }> };
    create(doc: unknown): Promise<unknown>;
    upsert(doc: unknown): Promise<unknown>;
  };
}

export interface CosmosClientLike {
  database(id: string): { container(id: string): CosmosContainerLike };
}

/* ------------------------------------------------------------------ */

export interface CosmosStoreOptions {
  /** Account endpoint, e.g. https://<account>.documents.azure.com. */
  endpoint?: string;
  /** Azure credential — managed identity, developer sign-in, etc. */
  credential?: TokenCredential;
  /**
   * Pre-built client (tests, the emulator). When present, `endpoint` and
   * `credential` are unused. Note there is no account-key or
   * connection-string option here, by design.
   */
  client?: CosmosClientLike;
  databaseId?: string;
  dataContainerId?: string;
  keysContainerId?: string;
  limits?: StoreLimits;
  /** Diagnostics sink; never receives key material. Default: stderr. */
  log?: (line: string) => void;
}

interface ProfileDoc {
  id: "profile";
  principalId: string;
  subject: string;
  label?: string;
  scopes: Scope[];
  /** Enumeration convenience on the CANONICAL profile; aliases are truth. */
  linkedSubjects?: { subject: string; label?: string }[];
  /**
   * Present on an ALIAS profile: this partition's subject is linked to the
   * named canonical principal. Resolution follows exactly one hop (aliases
   * are only ever created pointing at canonical profiles).
   */
  linkTo?: string;
}

interface WidgetDoc {
  id: string;
  principalId: string;
  widget: StoredWidget;
}

interface ThemeDoc {
  id: string;
  principalId: string;
  theme: ThemeEntry;
}

interface SchemaDoc {
  id: string;
  principalId: string;
  schema: StoredSchema;
}

interface KeyDoc {
  id: string;
  digest: string;
  principalId: string;
  keyId: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  revokedAt?: string;
}

function isServiceError(error: unknown): error is { code: number | string } {
  return typeof error === "object" && error !== null && "code" in error;
}

/** Wrap a Cosmos failure without letting credential/key material through. */
function operationError(operation: string, error: unknown): StoreRejectionError {
  const code = isServiceError(error) ? String(error.code) : "UNKNOWN";
  if (code === "403" || code === "Forbidden") {
    return new StoreRejectionError(
      "FORBIDDEN",
      `${operation}: this identity's Cosmos role does not permit the operation.`
    );
  }
  return new StoreRejectionError("STORE_ERROR", `${operation} failed (service code ${code}).`);
}

export function createCosmosStore(options: CosmosStoreOptions): WritableWidgetStore {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const log = options.log ?? ((line: string) => console.error(line));

  let client: CosmosClientLike;
  if (options.client !== undefined) {
    client = options.client;
  } else {
    if (options.endpoint === undefined || options.credential === undefined) {
      throw new StoreRejectionError(
        "INVALID_OPTIONS",
        "createCosmosStore needs an endpoint and a credential (or an injected client)."
      );
    }
    client = new CosmosClient({
      endpoint: options.endpoint,
      aadCredentials: options.credential
    }) as unknown as CosmosClientLike;
  }

  const database = client.database(options.databaseId ?? "widgentic");
  const data = database.container(options.dataContainerId ?? "data");
  const keys = database.container(options.keysContainerId ?? "keys");

  async function countEntries(principalId: string, prefix: string): Promise<number> {
    const { resources } = await data.items
      .query(
        {
          query:
            "SELECT VALUE COUNT(1) FROM c WHERE c.principalId = @p AND STARTSWITH(c.id, @prefix)",
          parameters: [
            { name: "@p", value: principalId },
            { name: "@prefix", value: prefix }
          ]
        },
        { partitionKey: principalId }
      )
      .fetchAll();
    return typeof resources[0] === "number" ? resources[0] : 0;
  }

  async function requirePrincipal(principalId: string): Promise<void> {
    const { resource } = await data.item("profile", principalId).read();
    if (resource === undefined) {
      throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
    }
  }

  function publicKey(doc: KeyDoc): StoredKey {
    return {
      id: doc.keyId,
      name: doc.name,
      createdAt: doc.createdAt,
      ...(doc.revokedAt === undefined ? {} : { revokedAt: doc.revokedAt }),
      scopes: doc.scopes,
      digestPreview: doc.digest.slice("sha256:".length, "sha256:".length + 8)
    };
  }

  const store: WritableWidgetStore = {
    async resolvePrincipal(apiKey) {
      if (typeof apiKey !== "string" || apiKey === "") return undefined;
      const digest = hashKey(apiKey);
      let resource: unknown;
      try {
        ({ resource } = await keys.item(digest, digest).read());
      } catch {
        // Resolution never throws to the caller — an unreachable store
        // degrades exactly like an unknown key: anonymous, not an error.
        log("widgentic store: key resolution failed against Cosmos (outcome only, no material).");
        return undefined;
      }
      if (resource === undefined) return undefined;
      const doc = resource as KeyDoc;
      if (doc.revokedAt !== undefined) return undefined;
      return { id: doc.principalId, scopes: doc.scopes };
    },

    async widgets(principalId) {
      const { resources } = await data.items
        .query(
          {
            query:
              "SELECT * FROM c WHERE c.principalId = @p AND STARTSWITH(c.id, 'widget:')",
            parameters: [{ name: "@p", value: principalId }]
          },
          { partitionKey: principalId }
        )
        .fetchAll();
      const out: StoredWidget[] = [];
      for (const raw of resources) {
        const doc = raw as WidgetDoc;
        if (doc.widget === undefined || typeof doc.widget.kind !== "string") {
          log(`widgentic store: skipping malformed widget doc '${doc.id}' for ${principalId}.`);
          continue;
        }
        const problem = checkStoredWidget(doc.widget, limits);
        if (problem) {
          log(
            `widgentic store: skipping widget '${doc.widget.kind}' for ${principalId}: ${problem.code}.`
          );
          continue;
        }
        out.push(doc.widget);
      }
      return out;
    },

    async themes(principalId) {
      const { resources } = await data.items
        .query(
          {
            query:
              "SELECT * FROM c WHERE c.principalId = @p AND STARTSWITH(c.id, 'theme:')",
            parameters: [{ name: "@p", value: principalId }]
          },
          { partitionKey: principalId }
        )
        .fetchAll();
      const out: ThemeEntry[] = [];
      for (const raw of resources) {
        const doc = raw as ThemeDoc;
        if (doc.theme === undefined || typeof doc.theme.name !== "string") {
          log(`widgentic store: skipping malformed theme doc '${doc.id}' for ${principalId}.`);
          continue;
        }
        const problem = checkStoredTheme(doc.theme, limits);
        if (problem) {
          log(
            `widgentic store: skipping theme '${doc.theme.name}' for ${principalId}: ${problem.code}.`
          );
          continue;
        }
        out.push(doc.theme);
      }
      return out;
    },

    async putWidget(principalId, widget) {
      const problem = checkStoredWidget(widget, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      await requirePrincipal(principalId);
      // A ref must name a schema this principal stores — a point read on
      // the same partition, refusing at the door like every other rule.
      const ref = widget.descriptor.dataSchemaRef;
      if (ref !== undefined) {
        const { statusCode: schemaStatus } = await data
          .item(`schema:${ref}`, principalId)
          .read();
        if (schemaStatus === 404) {
          throw new StoreRejectionError(
            "UNKNOWN_SCHEMA",
            `widget references missing schema '${ref}'.`
          );
        }
      }
      const id = `widget:${widget.kind}`;
      const { statusCode } = await data.item(id, principalId).read();
      if (statusCode === 404) {
        const count = await countEntries(principalId, "widget:");
        if (count >= limits.maxWidgets) {
          throw new StoreRejectionError(
            "TOO_MANY_WIDGETS",
            `principal is at the ${limits.maxWidgets}-widget limit.`
          );
        }
      }
      const doc: WidgetDoc = { id, principalId, widget };
      try {
        await data.items.upsert(doc);
      } catch (error) {
        throw operationError("putWidget", error);
      }
    },

    async putTheme(principalId, theme) {
      const problem = checkStoredTheme(theme, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      await requirePrincipal(principalId);
      const id = `theme:${theme.name}`;
      const { statusCode } = await data.item(id, principalId).read();
      if (statusCode === 404) {
        const count = await countEntries(principalId, "theme:");
        if (count >= limits.maxThemes) {
          throw new StoreRejectionError(
            "TOO_MANY_THEMES",
            `principal is at the ${limits.maxThemes}-theme limit.`
          );
        }
      }
      const doc: ThemeDoc = { id, principalId, theme };
      try {
        await data.items.upsert(doc);
      } catch (error) {
        throw operationError("putTheme", error);
      }
    },

    async schemas(principalId) {
      const { resources } = await data.items
        .query(
          {
            query:
              "SELECT * FROM c WHERE c.principalId = @p AND STARTSWITH(c.id, 'schema:')",
            parameters: [{ name: "@p", value: principalId }]
          },
          { partitionKey: principalId }
        )
        .fetchAll();
      const out: StoredSchema[] = [];
      for (const raw of resources) {
        const doc = raw as SchemaDoc;
        if (doc.schema === undefined || typeof doc.schema.name !== "string") {
          log(`widgentic store: skipping malformed schema doc '${doc.id}' for ${principalId}.`);
          continue;
        }
        const problem = checkStoredSchema(doc.schema, limits);
        if (problem) {
          log(
            `widgentic store: skipping schema '${doc.schema.name}' for ${principalId}: ${problem.code}.`
          );
          continue;
        }
        out.push(doc.schema);
      }
      return out;
    },

    async putSchema(principalId, schema) {
      const problem = checkStoredSchema(schema, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      await requirePrincipal(principalId);
      const id = `schema:${schema.name}`;
      const { statusCode } = await data.item(id, principalId).read();
      if (statusCode === 404) {
        const count = await countEntries(principalId, "schema:");
        if (count >= limits.maxSchemas) {
          throw new StoreRejectionError(
            "TOO_MANY_SCHEMAS",
            `principal is at the ${limits.maxSchemas}-schema limit.`
          );
        }
      }
      const doc: SchemaDoc = { id, principalId, schema };
      try {
        await data.items.upsert(doc);
      } catch (error) {
        throw operationError("putSchema", error);
      }
    },

    async removeWidget(principalId, kind) {
      try {
        await data.item(`widget:${kind}`, principalId).delete();
      } catch (error) {
        if (isServiceError(error) && String(error.code) === "404") return;
        throw operationError("removeWidget", error);
      }
    },

    async removeTheme(principalId, name) {
      try {
        await data.item(`theme:${name}`, principalId).delete();
      } catch (error) {
        if (isServiceError(error) && String(error.code) === "404") return;
        throw operationError("removeTheme", error);
      }
    },

    async removeSchema(principalId, name) {
      // In-use guard: one single-partition query over the principal's own
      // widgets — the same behavior every adapter must show identically.
      const { resources } = await data.items
        .query(
          {
            query:
              "SELECT VALUE c.widget.kind FROM c WHERE c.principalId = @p " +
              "AND STARTSWITH(c.id, 'widget:') AND c.widget.descriptor.dataSchemaRef = @ref",
            parameters: [
              { name: "@p", value: principalId },
              { name: "@ref", value: name }
            ]
          },
          { partitionKey: principalId }
        )
        .fetchAll();
      const referencing = resources.filter((r): r is string => typeof r === "string");
      if (referencing.length > 0) {
        throw new StoreRejectionError(
          "SCHEMA_IN_USE",
          `schema '${name}' is referenced by: ${referencing.join(", ")}.`
        );
      }
      try {
        await data.item(`schema:${name}`, principalId).delete();
      } catch (error) {
        if (isServiceError(error) && String(error.code) === "404") return;
        throw operationError("removeSchema", error);
      }
    },

    async ensurePrincipal(subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const id = principalIdForSubject(subject);
      const { resource } = await data.item("profile", id).read();
      if (resource !== undefined) {
        let doc = resource as ProfileDoc;
        if (doc.linkTo !== undefined) {
          // Linked subject: one hop to the canonical profile (aliases only
          // ever point at canonical profiles — no chains by construction).
          const { resource: canonical } = await data.item("profile", doc.linkTo).read();
          if (canonical !== undefined) doc = canonical as ProfileDoc;
        }
        return {
          id: doc.principalId,
          ...(doc.label === undefined ? {} : { label: doc.label }),
          scopes: doc.scopes,
          subject: doc.subject
        };
      }
      const profile: ProfileDoc = {
        id: "profile",
        principalId: id,
        subject,
        ...(label === undefined ? {} : { label }),
        scopes: ["read", "write"]
      };
      try {
        await data.items.create(profile);
      } catch (error) {
        // A concurrent first sign-in may have won the race; re-read.
        if (isServiceError(error) && String(error.code) === "409") {
          const again = (await data.item("profile", id).read()).resource as ProfileDoc;
          return {
            id: again.principalId,
            ...(again.label === undefined ? {} : { label: again.label }),
            scopes: again.scopes,
            subject: again.subject
          };
        }
        throw operationError("ensurePrincipal", error);
      }
      const principal: Principal = {
        id,
        ...(label === undefined ? {} : { label }),
        scopes: ["read", "write"]
      };
      return principal;
    },

    async createKey(principalId, name) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new StoreRejectionError("INVALID_KEY_NAME", "key name must be non-empty.");
      }
      const { resource } = await data.item("profile", principalId).read();
      if (resource === undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      const raw = generateKey();
      const digest = hashKey(raw);
      const doc: KeyDoc = {
        id: digest,
        digest,
        principalId,
        keyId: `key_${digest.slice("sha256:".length, "sha256:".length + 16)}`,
        name: name.trim(),
        scopes: ["read"],
        createdAt: new Date().toISOString()
      };
      try {
        await keys.items.create(doc);
      } catch (error) {
        throw operationError("createKey", error);
      }
      const created: CreatedKey = { key: raw, entry: publicKey(doc) };
      return created;
    },

    async listKeys(principalId) {
      // Management plane: a filtered query over the (small) keys
      // container. Deliberately not denormalized into `data` — the hot
      // path is resolvePrincipal's point read, and this one is rare.
      const { resources } = await keys.items
        .query({
          query: "SELECT * FROM c WHERE c.principalId = @p",
          parameters: [{ name: "@p", value: principalId }]
        })
        .fetchAll();
      return (resources as KeyDoc[]).map(publicKey);
    },

    async revokeKey(principalId, keyId) {
      const { resources } = await keys.items
        .query({
          query: "SELECT * FROM c WHERE c.principalId = @p AND c.keyId = @k",
          parameters: [
            { name: "@p", value: principalId },
            { name: "@k", value: keyId }
          ]
        })
        .fetchAll();
      const doc = resources[0] as KeyDoc | undefined;
      if (doc === undefined) throw new StoreRejectionError("UNKNOWN_KEY", keyId);
      if (doc.revokedAt !== undefined) return;
      try {
        await keys
          .item(doc.id, doc.digest)
          .replace({ ...doc, revokedAt: new Date().toISOString() });
      } catch (error) {
        throw operationError("revokeKey", error);
      }
    },

    async linkSubject(principalId, subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const canonical = await readProfile(principalId);
      if (canonical === undefined || canonical.linkTo !== undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      if (subject === canonical.subject) return; // canonical already resolves here
      const aliasId = principalIdForSubject(subject);
      const at = await readProfile(aliasId);
      if (at !== undefined) {
        if (at.linkTo === principalId) {
          await addLinkedSubject(canonical, subject, label); // heal the list
          return;
        }
        if (at.linkTo !== undefined) {
          // A subject deliberately linked elsewhere is never stolen.
          throw new StoreRejectionError("SUBJECT_IN_USE", "subject already resolves to another account.");
        }
        // The subject owns its own principal: absorb only when empty —
        // emptiness INCLUDES unrevoked keys, or absorbing would silently
        // re-point a working key's catalog.
        const [w, t, sc, keys] = await Promise.all([
          store.widgets(aliasId),
          store.themes(aliasId),
          store.schemas(aliasId),
          store.listKeys(aliasId)
        ]);
        if (w.length > 0 || t.length > 0 || sc.length > 0 || keys.some((k) => k.revokedAt === undefined)) {
          throw new StoreRejectionError(
            "SUBJECT_IN_USE",
            "subject already owns an account with content — remove its widgets, themes, schemas, and keys first."
          );
        }
      }
      const alias: ProfileDoc = {
        id: "profile",
        principalId: aliasId,
        subject,
        ...(label === undefined ? {} : { label }),
        scopes: [],
        linkTo: principalId
      };
      try {
        await data.items.upsert(alias);
        await addLinkedSubject(canonical, subject, label);
      } catch (error) {
        throw operationError("linkSubject", error);
      }
    },
    async unlinkSubject(principalId, subject) {
      const canonical = await readProfile(principalId);
      if (canonical === undefined || canonical.linkTo !== undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      if (subject === canonical.subject) {
        throw new StoreRejectionError(
          "CANNOT_UNLINK_PRIMARY",
          "the account's primary identity cannot be unlinked."
        );
      }
      const aliasId = principalIdForSubject(subject);
      const at = await readProfile(aliasId);
      try {
        if (at !== undefined && at.linkTo === principalId) {
          await data.item("profile", aliasId).delete();
        }
        const linked = (canonical.linkedSubjects ?? []).filter(
          (entry) => entry.subject !== subject
        );
        await data
          .item("profile", principalId)
          .replace({ ...canonical, linkedSubjects: linked });
      } catch (error) {
        throw operationError("unlinkSubject", error);
      }
    },
    async listLinkedSubjects(principalId) {
      const canonical = await readProfile(principalId);
      if (canonical === undefined || canonical.linkTo !== undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      return [...(canonical.linkedSubjects ?? [])].sort((a, b) =>
        a.subject.localeCompare(b.subject)
      );
    }
  };

  /** Point-read a profile doc; undefined when absent. */
  async function readProfile(principalId: string): Promise<ProfileDoc | undefined> {
    try {
      const { resource } = await data.item("profile", principalId).read();
      return resource as ProfileDoc | undefined;
    } catch (error) {
      if (isServiceError(error) && String(error.code) === "404") return undefined;
      throw operationError("readProfile", error);
    }
  }

  async function addLinkedSubject(
    canonical: ProfileDoc,
    subject: string,
    label?: string
  ): Promise<void> {
    const linked = canonical.linkedSubjects ?? [];
    if (linked.some((entry) => entry.subject === subject)) return;
    const entry = { subject, ...(label === undefined ? {} : { label }) };
    await data
      .item("profile", canonical.principalId)
      .replace({ ...canonical, linkedSubjects: [...linked, entry] });
  }

  return store;
}

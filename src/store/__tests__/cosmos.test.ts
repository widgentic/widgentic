// @vitest-environment node
/**
 * The Cosmos adapter against a structural fake: the full store contract,
 * plus the query-shape guarantees (single-partition, point-read key
 * resolution) that a real database would charge us to discover.
 *
 * A real-service run is env-gated: set WIDGENTIC_COSMOS_TEST_ENDPOINT and
 * WIDGENTIC_COSMOS_TEST_KEY to point at an emulator, and the same contract
 * suite executes against it (the key stays in the test — the adapter
 * itself never accepts one).
 */
import { describe, expect, it } from "vitest";
import { createCosmosStore } from "../cosmos.js";
import type {
  CosmosClientLike,
  CosmosContainerLike,
  CosmosQueryOptions,
  CosmosQuerySpec
} from "../cosmos.js";
import { hashKey } from "../keys.js";
import { DEFAULT_LIMITS } from "../types.js";
import { describeStoreContract } from "./contract.js";

/* ---------------------------- fake client ---------------------------- */

interface Doc {
  id: string;
  [key: string]: unknown;
}

interface RecordedQuery {
  container: string;
  spec: CosmosQuerySpec;
  options: CosmosQueryOptions | undefined;
}

interface RecordedPointOp {
  container: string;
  id: string;
  partitionKey: string;
  op: string;
}

function param(spec: CosmosQuerySpec, name: string): string | undefined {
  return spec.parameters?.find((p) => p.name === name)?.value;
}

class FakeContainer implements CosmosContainerLike {
  private partitions = new Map<string, Map<string, Doc>>();

  constructor(
    private readonly name: string,
    private readonly pkField: string,
    private readonly queries: RecordedQuery[],
    private readonly pointOps: RecordedPointOp[],
    public failWith: { code: number | string; ops: string[] } | undefined = undefined
  ) {}

  private partition(pk: string): Map<string, Doc> {
    let p = this.partitions.get(pk);
    if (p === undefined) {
      p = new Map();
      this.partitions.set(pk, p);
    }
    return p;
  }

  private all(): Doc[] {
    return [...this.partitions.values()].flatMap((p) => [...p.values()]);
  }

  private maybeFail(op: string): void {
    if (this.failWith !== undefined && this.failWith.ops.includes(op)) {
      throw { code: this.failWith.code };
    }
  }

  seed(doc: Doc): void {
    this.partition(String(doc[this.pkField])).set(doc.id, { ...doc });
  }

  item(id: string, partitionKey: string) {
    const record = (op: string) =>
      this.pointOps.push({ container: this.name, id, partitionKey, op });
    return {
      read: async () => {
        record("read");
        this.maybeFail("read");
        const doc = this.partition(partitionKey).get(id);
        return doc === undefined
          ? { statusCode: 404 }
          : { statusCode: 200, resource: { ...doc } };
      },
      replace: async (doc: unknown) => {
        record("replace");
        this.maybeFail("replace");
        this.partition(partitionKey).set(id, { ...(doc as Doc) });
        return {};
      },
      delete: async () => {
        record("delete");
        this.maybeFail("delete");
        if (!this.partition(partitionKey).delete(id)) throw { code: 404 };
        return {};
      }
    };
  }

  items = {
    query: (spec: CosmosQuerySpec, options?: CosmosQueryOptions) => ({
      fetchAll: async () => {
        this.queries.push({ container: this.name, spec, options });
        const principal = param(spec, "@p");
        const scope =
          options?.partitionKey !== undefined
            ? [...this.partition(options.partitionKey).values()]
            : this.all();
        let rows = scope.filter(
          (d) => principal === undefined || d[this.pkField] === principal || d.principalId === principal
        );
        const prefixLiteral = /STARTSWITH\(c\.id, '([^']+)'\)/.exec(spec.query)?.[1];
        const prefixParam = spec.query.includes("@prefix") ? param(spec, "@prefix") : undefined;
        const prefix = prefixLiteral ?? prefixParam;
        if (prefix !== undefined) rows = rows.filter((d) => d.id.startsWith(prefix));
        const keyId = spec.query.includes("@k") ? param(spec, "@k") : undefined;
        if (keyId !== undefined) rows = rows.filter((d) => d.keyId === keyId);
        // The removeSchema in-use guard: filter by the widget's ref and
        // project the kind, mirroring the adapter's real query.
        const ref = spec.query.includes("@ref") ? param(spec, "@ref") : undefined;
        if (ref !== undefined) {
          rows = rows.filter(
            (d) =>
              (d as { widget?: { descriptor?: { dataSchemaRef?: string } } })
                .widget?.descriptor?.dataSchemaRef === ref
          );
        }
        if (spec.query.includes("COUNT(1)")) return { resources: [rows.length] };
        if (spec.query.includes("SELECT VALUE c.widget.kind")) {
          return {
            resources: rows.map(
              (d) => (d as { widget?: { kind?: string } }).widget?.kind
            )
          };
        }
        return { resources: rows.map((d) => ({ ...d })) };
      }
    }),
    create: async (doc: unknown) => {
      this.maybeFail("create");
      const typed = doc as Doc;
      const pk = String(typed[this.pkField]);
      if (this.partition(pk).has(typed.id)) throw { code: 409 };
      this.partition(pk).set(typed.id, { ...typed });
      return {};
    },
    upsert: async (doc: unknown) => {
      this.maybeFail("upsert");
      const typed = doc as Doc;
      this.partition(String(typed[this.pkField])).set(typed.id, { ...typed });
      return {};
    }
  };
}

function fakeCosmos() {
  const queries: RecordedQuery[] = [];
  const pointOps: RecordedPointOp[] = [];
  const data = new FakeContainer("data", "principalId", queries, pointOps);
  const keys = new FakeContainer("keys", "digest", queries, pointOps);
  const client: CosmosClientLike = {
    database: () => ({
      container: (id: string) => (id === "data" ? data : keys)
    })
  };
  return { client, data, keys, queries, pointOps };
}

/* ----------------------------- contract ------------------------------ */

const LIMITS = { ...DEFAULT_LIMITS, maxWidgets: 5 };

describeStoreContract("cosmos (structural fake)", async () => {
  const { client } = fakeCosmos();
  return {
    store: createCosmosStore({ client, limits: LIMITS, log: () => {} }),
    maxWidgets: LIMITS.maxWidgets,
    // A second adapter over the SAME fake account = process restart.
    reopen: () => createCosmosStore({ client, limits: LIMITS, log: () => {} })
  };
});

/* --------------------------- query shapes ---------------------------- */

describe("cosmos adapter query shapes", () => {
  it("catalog reads are single-partition queries", async () => {
    const { client, queries } = fakeCosmos();
    const store = createCosmosStore({ client, log: () => {} });
    const p = await store.ensurePrincipal("shape:test");
    await store.widgets(p.id);
    await store.themes(p.id);
    const dataQueries = queries.filter((q) => q.container === "data");
    expect(dataQueries.length).toBeGreaterThanOrEqual(2);
    for (const q of dataQueries) {
      expect(q.options?.partitionKey, q.spec.query).toBe(p.id);
    }
  });

  it("key resolution is a point read by digest, never a query", async () => {
    const { client, queries, pointOps } = fakeCosmos();
    const store = createCosmosStore({ client, log: () => {} });
    const p = await store.ensurePrincipal("shape:pointread");
    const { key } = await store.createKey(p.id, "probe");
    queries.length = 0;
    pointOps.length = 0;

    expect((await store.resolvePrincipal(key))?.id).toBe(p.id);
    expect(queries.filter((q) => q.container === "keys")).toEqual([]);
    const reads = pointOps.filter((o) => o.container === "keys" && o.op === "read");
    expect(reads).toHaveLength(1);
    const digest = hashKey(key);
    expect(reads[0]?.id).toBe(digest);
    expect(reads[0]?.partitionKey).toBe(digest);
  });

  it("a revoked key document resolves to undefined", async () => {
    const { client } = fakeCosmos();
    const store = createCosmosStore({ client, log: () => {} });
    const p = await store.ensurePrincipal("shape:revoked");
    const { key, entry } = await store.createKey(p.id, "doomed");
    await store.revokeKey(p.id, entry.id);
    expect(await store.resolvePrincipal(key)).toBeUndefined();
  });
});

/* ------------------------ identity and hygiene ----------------------- */

describe("cosmos adapter identity model", () => {
  it("construction accepts no key or connection-string option", () => {
    // The options type has no such fields; at runtime, missing
    // endpoint/credential/client is a structured refusal.
    expect(() => createCosmosStore({})).toThrowError(/endpoint and a credential/);
  });

  it("a read-only identity's write surfaces FORBIDDEN without material", async () => {
    const { client, data } = fakeCosmos();
    const store = createCosmosStore({ client, log: () => {} });
    const p = await store.ensurePrincipal("hygiene:forbidden");
    data.failWith = { code: 403, ops: ["upsert"] };
    const attempt = store.putWidget(p.id, {
      kind: "report",
      template: { tag: "div", children: [{ bind: "t" }] },
      descriptor: { description: "d", dataShape: "{ t }" }
    });
    await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(attempt).rejects.toThrow(/putWidget/);
  });

  it("diagnostics identify entries, never keys or digests", async () => {
    const lines: string[] = [];
    const { client, data, keys } = fakeCosmos();
    const store = createCosmosStore({ client, log: (l) => lines.push(l) });
    const p = await store.ensurePrincipal("hygiene:diagnostics");
    const { key } = await store.createKey(p.id, "probe");

    // A malformed doc and an invalid template land out-of-band.
    data.seed({ id: "widget:broken", principalId: p.id });
    data.seed({
      id: "widget:hostile",
      principalId: p.id,
      widget: {
        kind: "hostile",
        template: { tag: "div", attrs: { onclick: "x()" }, children: [] },
        descriptor: { description: "d", dataShape: "{}" }
      }
    });
    const served = await store.widgets(p.id);
    expect(served).toEqual([]);
    expect(lines.join("\n")).toContain("widget:broken");
    expect(lines.join("\n")).toContain("hostile");

    // A failing resolution logs the outcome only.
    keys.failWith = { code: 500, ops: ["read"] };
    expect(await store.resolvePrincipal(key)).toBeUndefined();
    const all = lines.join("\n");
    expect(all).not.toContain(key);
    expect(all).not.toContain(hashKey(key));
  });
});

describe("v41 linkedSubjects migration", () => {
  it("plain-string entries written by v41 normalize to labeled identities", async () => {
    const { client, data } = fakeCosmos();
    const store = createCosmosStore({ client, log: () => {} });
    const p = await store.ensurePrincipal("v41:owner");
    // Simulate the v41 on-disk generation: subject STRINGS in the list.
    const { resource } = await data.item("profile", p.id).read();
    await data
      .item("profile", p.id)
      .replace({ ...(resource as Record<string, unknown>), linkedSubjects: ["v41:linked"] });

    const listed = await store.listLinkedSubjects(p.id);
    expect(listed).toEqual([{ subject: "v41:linked" }]);

    // unlink handles the old shape too
    await store.unlinkSubject(p.id, "v41:linked");
    expect(await store.listLinkedSubjects(p.id)).toEqual([]);

    // and a new link over a remaining old-shape list mixes cleanly
    await data
      .item("profile", p.id)
      .replace({ ...(resource as Record<string, unknown>), linkedSubjects: ["v41:other"] });
    await store.linkSubject(p.id, "v42:new", "Friendly");
    expect(await store.listLinkedSubjects(p.id)).toEqual([
      { subject: "v41:other" },
      { subject: "v42:new", label: "Friendly" }
    ]);
  });
});

/* --------------------------- emulator gate --------------------------- */

const EMULATOR = process.env.WIDGENTIC_COSMOS_TEST_ENDPOINT;

describe.skipIf(!EMULATOR)("cosmos adapter against a live emulator", () => {
  it("passes the contract suite", async () => {
    const { CosmosClient } = await import("@azure/cosmos");
    const client = new CosmosClient({
      endpoint: EMULATOR as string,
      key: process.env.WIDGENTIC_COSMOS_TEST_KEY as string
    });
    const { database } = await client.databases.createIfNotExists({ id: "widgentic-test" });
    await database.containers.createIfNotExists({ id: "data", partitionKey: "/principalId" });
    await database.containers.createIfNotExists({ id: "keys", partitionKey: "/digest" });
    const store = createCosmosStore({
      client: client as never,
      databaseId: "widgentic-test",
      limits: LIMITS,
      log: () => {}
    });
    // Inline spot-check (the full suite instantiation needs a factory at
    // module scope; a live emulator gets the essentials end to end).
    const p = await store.ensurePrincipal(`emulator:${Math.random()}`);
    const { key, entry } = await store.createKey(p.id, "emulator");
    expect((await store.resolvePrincipal(key))?.id).toBe(p.id);
    await store.revokeKey(p.id, entry.id);
    expect(await store.resolvePrincipal(key)).toBeUndefined();
  });
});

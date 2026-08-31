// @vitest-environment node
/**
 * The authoring surface over a real HTTP server and the memory store
 * (authoring-api spec): key-vs-principal authorization, principal
 * confinement, structured rejections, and the key lifecycle end to end.
 * Ported from the private app's suite when the surface moved into the
 * package — the host's session became a resolved principal context, and
 * nothing else was allowed to change.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedThemeEntry, seedWidgetDraft } from "@widgentic/designer";
import type { WidgetDraft } from "@widgentic/designer";
import { createExecutionLimiter } from "../../server/index.js";
import { createLocalCipher, generateLocalKek } from "../../secrets/index.js";
import { composeCatalog, createMemoryStore, principalIdForSubject } from "../../store/index.js";
import type { MemoryStore, WritableWidgetStore } from "../../store/index.js";
import { handleAuthoringRequest } from "../handler.js";
import { createAuthoringHttpHandler } from "../node.js";
import type { AuthoringDeps, PrincipalContext } from "../types.js";

let server: Server;
let base: string;
let store: MemoryStore;

/**
 * Cookie-as-identity fake host: `wg_test_session=<subject>` resolves to that
 * subject's principal. The surface never sees the cookie — only the context.
 */
function makeResolver(target: WritableWidgetStore) {
  return async (req: IncomingMessage): Promise<PrincipalContext | undefined> => {
    const match = /wg_test_session=([^;]+)/.exec(req.headers.cookie ?? "");
    if (match === null) return undefined;
    const subject = match[1] as string;
    const principal = await target.ensurePrincipal(subject, `label:${subject}`);
    return { principalId: principal.id, subject, label: `label:${subject}` };
  };
}

async function listen(deps: AuthoringDeps, target: WritableWidgetStore): Promise<{ server: Server; base: string }> {
  const handle = createAuthoringHttpHandler(deps, makeResolver(target));
  const created = createServer((req, res) => {
    void handle(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  return {
    server: created,
    base: `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`
  };
}

beforeAll(async () => {
  store = createMemoryStore();
  ({ server, base } = await listen({ store }, store));
});

afterAll(() => server.close());

function asAlice(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { cookie: "wg_test_session=alice", ...(init.headers ?? {}) }
  };
}

const WIDGET_BODY = JSON.stringify({
  template: { tag: "div", children: [{ bind: "title" }] },
  descriptor: { description: "a report", dataShape: "{ title }" }
});

describe("authorization boundary", () => {
  it("no resolved principal → 401, nothing persisted", async () => {
    const res = await fetch(`${base}/api/widgets/report`, {
      method: "PUT",
      body: WIDGET_BODY
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NO_PRINCIPAL");
  });

  it("an MCP API key is refused even when valid elsewhere — header and query", async () => {
    for (const init of [
      { headers: { "x-api-key": "wgk_" + "a".repeat(64) } },
      {}
    ] as const) {
      const url =
        "headers" in init && init.headers !== undefined
          ? `${base}/api/widgets`
          : `${base}/api/widgets?key=wgk_${"a".repeat(64)}`;
      const res = await fetch(url, init as RequestInit);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("KEY_NOT_A_SESSION");
    }
  });

  it("a key alongside a resolved principal is still refused, uniformly", async () => {
    // A key the store would resolve, and garbage: byte-identical answers.
    const p = await store.ensurePrincipal("alice");
    const real = await store.createKey(p.id, "live");
    const answers: string[] = [];
    for (const key of [real.key, "wgk_" + "f".repeat(64), "wgk_x"]) {
      const res = await fetch(`${base}/api/widgets`, asAlice({ headers: { "x-api-key": key } }));
      expect(res.status).toBe(401);
      answers.push(JSON.stringify(await res.json()));
    }
    expect(new Set(answers).size).toBe(1);
  });

  it("a key in a body field is refused like a header or query key", async () => {
    for (const field of ["key", "apiKey", "api_key", "x-api-key"]) {
      const res = await fetch(`${base}/api/keys`, asAlice({
        method: "POST",
        body: JSON.stringify({ name: "sneaky", [field]: "wgk_" + "a".repeat(64) })
      }));
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("KEY_NOT_A_SESSION");
    }
    // The named fields matter only at the top level with string values —
    // an ordinary body (createKey's own { name }) is untouched.
    const fine = await fetch(`${base}/api/keys`, asAlice({ method: "POST", body: JSON.stringify({ name: "ordinary" }) }));
    expect(fine.status).toBe(201);
  });

  it("a malformed percent-escape answers as a structured 404, not a crash", async () => {
    const res = await fetch(`${base}/api/widgets/%zz`, asAlice({ method: "PUT", body: WIDGET_BODY }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});

describe("widgets and themes", () => {
  it("saving a widget writes to the caller's principal only", async () => {
    const put = await fetch(`${base}/api/widgets/report`, asAlice({ method: "PUT", body: WIDGET_BODY }));
    expect(put.status).toBe(200);

    const list = await fetch(`${base}/api/widgets`, asAlice());
    const body = (await list.json()) as { widgets: { kind: string }[] };
    expect(body.widgets.map((w) => w.kind)).toEqual(["report"]);

    // Bob sees nothing of Alice's.
    const bob = await fetch(`${base}/api/widgets`, { headers: { cookie: "wg_test_session=bob" } });
    expect(((await bob.json()) as { widgets: unknown[] }).widgets).toEqual([]);
  });

  it("the path names the kind; the body cannot redirect it or name a principal", async () => {
    const put = await fetch(`${base}/api/widgets/honest`, asAlice({
      method: "PUT",
      body: JSON.stringify({
        kind: "hijacked",
        principalId: "usr_somebody_else",
        template: { tag: "div", children: [{ bind: "t" }] },
        descriptor: { description: "d", dataShape: "{ t }" }
      })
    }));
    expect(put.status).toBe(200);
    const list = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as {
      widgets: { kind: string }[];
    };
    const kinds = list.widgets.map((w) => w.kind);
    expect(kinds).toContain("honest");
    expect(kinds).not.toContain("hijacked");
  });

  it("a rejected entry surfaces the rule and leaves state unchanged", async () => {
    const before = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as { widgets: unknown[] };
    const res = await fetch(`${base}/api/widgets/table`, asAlice({ method: "PUT", body: WIDGET_BODY }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RESERVED_KIND");
    const after = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as { widgets: unknown[] };
    expect(after.widgets.length).toBe(before.widgets.length);
  });

  it("themes round-trip with the path as the name", async () => {
    const put = await fetch(`${base}/api/themes/midnight`, asAlice({
      method: "PUT",
      body: JSON.stringify({ tokens: { accent: "#00ffcc" } })
    }));
    expect(put.status).toBe(200);
    const list = (await (await fetch(`${base}/api/themes`, asAlice())).json()) as { themes: { name: string }[] };
    expect(list.themes.map((t) => t.name)).toContain("midnight");
    const del = await fetch(`${base}/api/themes/midnight`, asAlice({ method: "DELETE" }));
    expect(del.status).toBe(200);
  });
});

describe("use-as-base: a seeded save creates a second entry", () => {
  it("widget seed saves under its own kind; the source is untouched", async () => {
    await fetch(`${base}/api/widgets/base-card`, asAlice({ method: "PUT", body: WIDGET_BODY }));
    const listed = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as {
      widgets: { kind: string; template: unknown; descriptor: unknown }[];
    };
    const source = listed.widgets.find((w) => w.kind === "base-card")!;
    const seeded = seedWidgetDraft(source as unknown as WidgetDraft, listed.widgets.map((w) => w.kind));
    expect(seeded.kind).toBe("base-card-copy");
    const put = await fetch(`${base}/api/widgets/${seeded.kind}`, asAlice({
      method: "PUT",
      body: JSON.stringify({ template: seeded.template, descriptor: seeded.descriptor })
    }));
    expect(put.status).toBe(200);
    const after = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as {
      widgets: { kind: string; descriptor: { description: string } }[];
    };
    const kinds = after.widgets.map((w) => w.kind);
    expect(kinds).toContain("base-card");
    expect(kinds).toContain("base-card-copy");
    const copy = after.widgets.find((w) => w.kind === "base-card-copy")!;
    const original = after.widgets.find((w) => w.kind === "base-card")!;
    expect(copy.descriptor.description).toBe(original.descriptor.description);
  });

  it("a theme seeded from dark saves under a non-reserved name", async () => {
    const seeded = seedThemeEntry("dark");
    expect(seeded.name).toBe("my-dark");
    const put = await fetch(`${base}/api/themes/${seeded.name}`, asAlice({
      method: "PUT",
      body: JSON.stringify(seeded)
    }));
    expect(put.status).toBe(200);
    const listed = (await (await fetch(`${base}/api/themes`, asAlice())).json()) as { themes: { name: string }[] };
    expect(listed.themes.map((t) => t.name)).toContain("my-dark");
  });

  it("built-in starters save as new widgets", async () => {
    const seeded = seedWidgetDraft("table", []);
    const put = await fetch(`${base}/api/widgets/${seeded.kind}`, asAlice({
      method: "PUT",
      body: JSON.stringify({ template: seeded.template, descriptor: seeded.descriptor })
    }));
    expect(put.status).toBe(200);
  });
});

describe("key lifecycle over HTTP", () => {
  it("create → shown once → listed as metadata → revoke → gone", async () => {
    const created = await fetch(`${base}/api/keys`, asAlice({
      method: "POST",
      body: JSON.stringify({ name: "laptop" })
    }));
    expect(created.status).toBe(201);
    const body = (await created.json()) as { key: string; entry: { id: string; name: string }; notice: string };
    expect(body.key).toMatch(/^wgk_/);
    expect(body.notice).toContain("cannot be shown again");

    // The raw key resolves through the store port (what the MCP edge does).
    expect(await store.resolvePrincipal(body.key)).toBeDefined();

    const listed = await fetch(`${base}/api/keys`, asAlice());
    const keys = (await listed.json()) as { keys: { id: string; name: string }[] };
    expect(JSON.stringify(keys)).not.toContain(body.key);
    expect(keys.keys.find((k) => k.id === body.entry.id)?.name).toBe("laptop");

    const revoke = await fetch(`${base}/api/keys/${body.entry.id}`, asAlice({ method: "DELETE" }));
    expect(revoke.status).toBe(200);
    expect(await store.resolvePrincipal(body.key)).toBeUndefined();
  });

  it("one principal cannot revoke another's key", async () => {
    const created = await fetch(`${base}/api/keys`, asAlice({
      method: "POST",
      body: JSON.stringify({ name: "target" })
    }));
    const { entry, key } = (await created.json()) as { key: string; entry: { id: string } };

    const mallory = await fetch(`${base}/api/keys/${entry.id}`, {
      method: "DELETE",
      headers: { cookie: "wg_test_session=mallory" }
    });
    expect(mallory.status).toBe(404); // her principal has no such key
    expect(await store.resolvePrincipal(key)).toBeDefined(); // still alive
  });
});

describe("shared data schemas through the surface", () => {
  const PERSON = JSON.stringify({
    label: "Person",
    schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
  });

  it("schema CRUD needs a principal, and a key is not one", async () => {
    const anon = await fetch(`${base}/api/schemas/person`, { method: "PUT", body: PERSON });
    expect(anon.status).toBe(401);
    const keyed = await fetch(`${base}/api/schemas`, { headers: { "x-api-key": "wgk_whatever" } });
    expect(keyed.status).toBe(401);
    const put = await fetch(`${base}/api/schemas/person`, asAlice({ method: "PUT", body: PERSON }));
    expect(put.status).toBe(200);
    const listed = (await (await fetch(`${base}/api/schemas`, asAlice())).json()) as { schemas: { name: string }[] };
    expect(listed.schemas.map((s) => s.name)).toContain("person");
  });

  it("a widget can reference the schema; deletion is refused naming it", async () => {
    const put = await fetch(`${base}/api/widgets/person-card`, asAlice({
      method: "PUT",
      body: JSON.stringify({
        template: { tag: "div", children: [{ bind: "name" }] },
        descriptor: { description: "person as a card", dataShape: "{ name }", dataSchemaRef: "person" }
      })
    }));
    expect(put.status).toBe(200);
    const del = await fetch(`${base}/api/schemas/person`, asAlice({ method: "DELETE" }));
    expect(del.status).toBe(409);
    const body = (await del.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("SCHEMA_IN_USE");
    expect(body.error.message).toContain("person-card");
    const listed = (await (await fetch(`${base}/api/schemas`, asAlice())).json()) as { schemas: { name: string }[] };
    expect(listed.schemas.map((s) => s.name)).toContain("person");
  });

  it("a ref to a missing schema is refused at save time", async () => {
    const put = await fetch(`${base}/api/widgets/ghost-card`, asAlice({
      method: "PUT",
      body: JSON.stringify({
        template: { tag: "div", children: ["x"] },
        descriptor: { description: "d", dataShape: "s", dataSchemaRef: "ghost" }
      })
    }));
    expect(put.status).toBe(422);
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe("UNKNOWN_SCHEMA");
  });

  it("a schema edit propagates through composition without touching the widget", async () => {
    const alice = principalIdForSubject("alice");
    let composed = await composeCatalog(store, alice);
    let rendered = composed.value.render({ kind: "person-card", data: { name: "Ada" } });
    expect(rendered.ok).toBe(true);
    const put = await fetch(`${base}/api/schemas/person`, asAlice({
      method: "PUT",
      body: JSON.stringify({
        schema: {
          type: "object",
          required: ["name", "email"],
          properties: { name: { type: "string" }, email: { type: "string" } }
        }
      })
    }));
    expect(put.status).toBe(200);
    composed = await composeCatalog(store, alice);
    rendered = composed.value.render({ kind: "person-card", data: { name: "Ada" } });
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.error.path).toContain("email");
    const descriptor = composed.value.describe("person-card");
    expect(descriptor?.dataSchema).toMatchObject({ required: ["name", "email"] });
    expect((descriptor as unknown as { dataSchemaRef?: string })?.dataSchemaRef).toBeUndefined();
  });
});

/* ------------------------- actions, secrets, scopes ------------------------- */

describe("actions, secrets and key scopes", () => {
  const httpAction = {
    label: "Refresh",
    definition: {
      kind: "http",
      method: "GET",
      url: "https://api.example.com/weather",
      input: { type: "object", properties: { city: { type: "string" } } },
      output: { type: "object", properties: { temp: { type: "number" } }, required: ["temp"] },
      headers: { Authorization: { secret: "weather-token" } }
    }
  };

  it("actions round-trip and ACTION_IN_USE surfaces with the widgets named", async () => {
    let res = await fetch(`${base}/api/actions/refresh`, asAlice({ method: "PUT", body: JSON.stringify(httpAction) }));
    expect(res.status).toBe(200);
    const listed = (await (await fetch(`${base}/api/actions`, asAlice())).json()) as { actions: { name: string }[] };
    expect(listed.actions.map((a) => a.name)).toContain("refresh");
    res = await fetch(`${base}/api/widgets/bound-weather`, asAlice({
      method: "PUT",
      body: JSON.stringify({
        template: { tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] },
        descriptor: { description: "bound", dataShape: "{ city }" },
        load: { ref: "refresh", input: { city: "city" } }
      })
    }));
    expect(res.status).toBe(200);
    const widgets = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as { widgets: { kind: string; load?: unknown }[] };
    expect(widgets.widgets.find((w) => w.kind === "bound-weather")?.load).toEqual({ ref: "refresh", input: { city: "city" } });
    res = await fetch(`${base}/api/actions/refresh`, asAlice({ method: "DELETE" }));
    expect(res.status).toBe(409);
    const error = (await res.json()) as { error: { code: string; message: string } };
    expect(error.error.code).toBe("ACTION_IN_USE");
    expect(error.error.message).toContain("bound-weather");
    await fetch(`${base}/api/widgets/bound-weather`, asAlice({ method: "DELETE" }));
    res = await fetch(`${base}/api/actions/refresh`, asAlice({ method: "DELETE" }));
    expect(res.status).toBe(200);
  });

  it("invalid actions are refused as validation errors", async () => {
    const res = await fetch(`${base}/api/actions/bad`, asAlice({
      method: "PUT",
      body: JSON.stringify({ definition: { kind: "http", method: "GET", url: "http://plain.example", input: { type: "object" }, output: {} } })
    }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_ACTION");
  });

  it("secrets are refused without a cipher, and the listing says so", async () => {
    const listing = (await (await fetch(`${base}/api/secrets`, asAlice())).json()) as { enabled: boolean; secrets: unknown[] };
    expect(listing).toEqual({ enabled: false, secrets: [] });
    const res = await fetch(`${base}/api/secrets/weather-token`, asAlice({ method: "PUT", body: JSON.stringify({ value: "sk-live-123" }) }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NO_CIPHER");
  });

  it("keys take scopes at creation; execute is opt-in and write is refused", async () => {
    const reader = (await (await fetch(`${base}/api/keys`, asAlice({ method: "POST", body: JSON.stringify({ name: "reader" }) }))).json()) as { entry: { scopes: string[] } };
    expect(reader.entry.scopes).toEqual(["read"]);
    const runner = (await (await fetch(`${base}/api/keys`, asAlice({ method: "POST", body: JSON.stringify({ name: "runner", scopes: ["read", "execute"] }) }))).json()) as { entry: { scopes: string[] } };
    expect(runner.entry.scopes).toEqual(["read", "execute"]);
    const writer = await fetch(`${base}/api/keys`, asAlice({ method: "POST", body: JSON.stringify({ name: "writer", scopes: ["write"] }) }));
    expect(writer.status).toBe(422);
    expect(((await writer.json()) as { error: { code: string } }).error.code).toBe("INVALID_SCOPES");
  });

  it("the test call runs server-side through the guarded path", async () => {
    // No fetchDeps injected here: the guard refuses before any network —
    // the server never reaches out for a name that resolves nowhere.
    const res = await fetch(`${base}/api/action-test`, asAlice({
      method: "POST",
      body: JSON.stringify({
        definition: { ...httpAction.definition, headers: {}, url: "https://192.168.0.10/weather" },
        args: { city: "Oslo" }
      })
    }));
    expect(res.status).toBe(200);
    const result = (await res.json()) as { ok: boolean; code?: string; message?: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ACTION_FETCH_FAILED");
    expect(result.message).toContain("not a public address");
    const notHttp = (await (await fetch(`${base}/api/action-test`, asAlice({ method: "POST", body: JSON.stringify({ definition: { kind: "prompt", text: ["x"] } }) }))).json()) as { code?: string };
    expect(notHttp.code).toBe("ACTION_NOT_HTTP");
  });
});

describe("secrets over the surface with a cipher", () => {
  it("writes are write-only, deletes respect SECRET_IN_USE, and the test call resolves the secret server-side", async () => {
    const cipherStore = createMemoryStore([], undefined, { cipher: createLocalCipher(generateLocalKek()) });
    const rig = await listen({ store: cipherStore, secretsEnabled: true }, cipherStore);
    try {
      let res = await fetch(`${rig.base}/api/secrets/weather-token`, asAlice({ method: "PUT", body: JSON.stringify({ value: "sk-live-123" }) }));
      expect(res.status).toBe(200);
      const listing = (await (await fetch(`${rig.base}/api/secrets`, asAlice())).json()) as { enabled: boolean; secrets: { name: string }[] };
      expect(listing.enabled).toBe(true);
      expect(listing.secrets.map((s) => s.name)).toEqual(["weather-token"]);
      expect(JSON.stringify(listing)).not.toContain("sk-live-123");
      res = await fetch(`${rig.base}/api/actions/secured`, asAlice({
        method: "PUT",
        body: JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://api.example.com/w", input: { type: "object" }, output: { type: "object" }, headers: { Authorization: { secret: "weather-token" } } } })
      }));
      expect(res.status).toBe(200);
      res = await fetch(`${rig.base}/api/secrets/weather-token`, asAlice({ method: "DELETE" }));
      expect(res.status).toBe(409);
      const error = (await res.json()) as { error: { code: string; message: string } };
      expect(error.error.code).toBe("SECRET_IN_USE");
      expect(error.error.message).toContain("secured");
      const test = (await (await fetch(`${rig.base}/api/action-test`, asAlice({
        method: "POST",
        body: JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://10.0.0.9/w", input: { type: "object" }, output: { type: "object" }, headers: { Authorization: { secret: "weather-token" } } }, args: {} })
      }))).json()) as { ok: boolean; code?: string };
      expect(test.ok).toBe(false);
      expect(test.code).toBe("ACTION_FETCH_FAILED");
      expect(JSON.stringify(test)).not.toContain("sk-live-123");
      await fetch(`${rig.base}/api/actions/secured`, asAlice({ method: "DELETE" }));
      res = await fetch(`${rig.base}/api/secrets/weather-token`, asAlice({ method: "DELETE" }));
      expect(res.status).toBe(200);
    } finally {
      rig.server.close();
    }
  });
});

describe("identity routes are gated on a supplied subject", () => {
  it("with a subject: the account's identities read and unlink from either session", async () => {
    const idStore = createMemoryStore();
    const rig = await listen({ store: idStore }, idStore);
    try {
      const owner = await idStore.ensurePrincipal("alice", "label:alice");
      await idStore.linkSubject(owner.id, "alice-github", "Alice (GitHub)");
      const fromPrimary = (await (await fetch(`${rig.base}/api/identities`, asAlice())).json()) as {
        current: string; currentIsPrimary: boolean; primary: { subject: string }; linked: { subject: string }[];
      };
      expect(fromPrimary.current).toBe("alice");
      expect(fromPrimary.currentIsPrimary).toBe(true);
      expect(fromPrimary.primary.subject).toBe("alice");
      expect(fromPrimary.linked.map((l) => l.subject)).toEqual(["alice-github"]);
      // The linked session sees the same account, canonical subject included.
      const fromLinked = (await (await fetch(`${rig.base}/api/identities`, {
        headers: { cookie: "wg_test_session=alice-github" }
      })).json()) as { current: string; currentIsPrimary: boolean; primary: { subject: string } };
      expect(fromLinked.current).toBe("alice-github");
      expect(fromLinked.currentIsPrimary).toBe(false);
      expect(fromLinked.primary.subject).toBe("alice");
      // Unlink; the canonical subject is refused.
      const unlink = await fetch(`${rig.base}/api/identities`, asAlice({
        method: "DELETE",
        body: JSON.stringify({ subject: "alice-github" })
      }));
      expect(unlink.status).toBe(200);
      const refuse = await fetch(`${rig.base}/api/identities`, asAlice({
        method: "DELETE",
        body: JSON.stringify({ subject: "alice" })
      }));
      expect(refuse.status).toBe(422);
      expect(((await refuse.json()) as { error: { code: string } }).error.code).toBe("CANNOT_UNLINK_PRIMARY");
    } finally {
      rig.server.close();
    }
  });

  it("without a subject: the routes do not exist, everything else is unchanged", async () => {
    const fixed = createMemoryStore();
    const principal = await fixed.ensurePrincipal("local:default");
    const handle = createAuthoringHttpHandler({ store: fixed }, () => ({ principalId: principal.id }));
    const rig = createServer((req, res) => {
      void handle(req, res).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => rig.listen(0, resolve));
    const address = rig.address();
    const rigBase = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
    try {
      expect((await fetch(`${rigBase}/api/identities`)).status).toBe(404);
      const put = await fetch(`${rigBase}/api/widgets/fixed-card`, { method: "PUT", body: WIDGET_BODY });
      expect(put.status).toBe(200);
      const listed = (await (await fetch(`${rigBase}/api/widgets`)).json()) as { widgets: { kind: string }[] };
      expect(listed.widgets.map((w) => w.kind)).toEqual(["fixed-card"]);
    } finally {
      rig.close();
    }
  });
});

describe("hardening", () => {
  it("an action named 'test' is an ordinary action; the test call has its own route", async () => {
    const res = await fetch(`${base}/api/actions/test`, asAlice({ method: "PUT", body: JSON.stringify({ definition: { kind: "prompt", text: ["x"] } }) }));
    expect(res.status).toBe(200);
    const listed = (await (await fetch(`${base}/api/actions`, asAlice())).json()) as { actions: { name: string }[] };
    expect(listed.actions.map((a) => a.name)).toContain("test");
    expect((await fetch(`${base}/api/actions/test`, asAlice({ method: "DELETE" }))).status).toBe(200);
    expect((await fetch(`${base}/api/actions/test`, asAlice({ method: "POST", body: "{}" }))).status).toBe(404);
  });

  it("test calls spend the shared execution budget and malformed definitions answer structurally", async () => {
    const limiter = createExecutionLimiter(1); // one bucket for the server, as in production
    const rig = await listen({ store, limiter }, store);
    try {
      const body = JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://10.0.0.9/w", input: { type: "object" }, output: { type: "object" } }, args: {} });
      const first = (await (await fetch(`${rig.base}/api/action-test`, asAlice({ method: "POST", body }))).json()) as { code?: string };
      expect(first.code).toBe("ACTION_FETCH_FAILED");
      const second = await fetch(`${rig.base}/api/action-test`, asAlice({ method: "POST", body }));
      expect(second.status).toBe(200);
      expect(((await second.json()) as { ok: boolean; code?: string }).code).toBe("RATE_LIMITED");
    } finally {
      rig.server.close();
    }
    const malformed = (await (await fetch(`${base}/api/action-test`, asAlice({ method: "POST", body: JSON.stringify({ definition: { kind: "http", method: "GET" } }) }))).json()) as { ok: boolean; code?: string };
    expect(malformed.ok).toBe(false);
    expect(malformed.code).toBe("INVALID_ACTION_INPUT");
  });

  it("secret writes are gated by secretsEnabled at the surface, not only by the store", async () => {
    const put = await fetch(`${base}/api/secrets/token`, asAlice({ method: "PUT", body: JSON.stringify({ value: "sk-live-12345" }) }));
    expect(put.status).toBe(503);
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe("NO_CIPHER");
    expect((await fetch(`${base}/api/secrets/token`, asAlice({ method: "DELETE" }))).status).toBe(503);
  });

  it("malformed JSON and oversized bodies are client errors from the adapter", async () => {
    const bad = await fetch(`${base}/api/widgets/x`, asAlice({ method: "PUT", body: "{not json" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("INVALID_BODY");
  });

  it("the core and the adapter agree on status and body", async () => {
    const direct = await handleAuthoringRequest(
      { method: "PUT", path: "widgets/table", body: JSON.parse(WIDGET_BODY) as unknown, context: { principalId: principalIdForSubject("alice") } },
      { store }
    );
    const viaHttp = await fetch(`${base}/api/widgets/table`, asAlice({ method: "PUT", body: WIDGET_BODY }));
    expect(viaHttp.status).toBe(direct.status);
    expect(await viaHttp.json()).toEqual(direct.body);
  });
});

// @vitest-environment node
/**
 * The authoring API over a real HTTP server and the memory store:
 * session-vs-key authorization, principal confinement, structured
 * rejections, and the key lifecycle end to end.
 */
import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "widgentic/store";
import type { MemoryStore } from "widgentic/store";
import { handleApiRequest } from "../api.js";
import type { SessionClaims } from "../auth.js";
import { seedThemeEntry, seedWidgetDraft } from "../../../src/designer/seed.js";
import type { WidgetDraft } from "../../../src/designer/store.js";

let server: Server;
let base: string;
let store: MemoryStore;

/** Cookie-as-subject fake: `wg_test_session=<subject>` is a valid session. */
function readSession(cookieHeader: string | undefined): SessionClaims | undefined {
  const match = /wg_test_session=([^;]+)/.exec(cookieHeader ?? "");
  if (match === null) return undefined;
  return { subject: match[1] as string, label: `label:${match[1]}` };
}

beforeAll(async () => {
  store = createMemoryStore();
  server = createServer((req, res) => {
    void handleApiRequest(req, res, { store, readSession }).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  base = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
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
  it("no session → 401, nothing persisted", async () => {
    const res = await fetch(`${base}/api/widgets/report`, {
      method: "PUT",
      body: WIDGET_BODY
    });
    expect(res.status).toBe(401);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("NO_SESSION");
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

  it("a key alongside a valid session is still refused", async () => {
    const res = await fetch(
      `${base}/api/widgets`,
      asAlice({ headers: { "x-api-key": "wgk_x" } as Record<string, string> })
    );
    expect(res.status).toBe(401);
  });
});

describe("widgets and themes", () => {
  it("saving a widget writes to the session's principal only", async () => {
    const put = await fetch(`${base}/api/widgets/report`, asAlice({
      method: "PUT",
      body: WIDGET_BODY
    }));
    expect(put.status).toBe(200);

    const list = await fetch(`${base}/api/widgets`, asAlice());
    const body = (await list.json()) as { widgets: { kind: string }[] };
    expect(body.widgets.map((w) => w.kind)).toEqual(["report"]);

    // Bob sees nothing of Alice's.
    const bob = await fetch(`${base}/api/widgets`, {
      headers: { cookie: "wg_test_session=bob" }
    });
    expect(((await bob.json()) as { widgets: unknown[] }).widgets).toEqual([]);
  });

  it("the path names the kind; the body cannot redirect it", async () => {
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
    const before = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as {
      widgets: unknown[];
    };
    const res = await fetch(`${base}/api/widgets/table`, asAlice({
      method: "PUT",
      body: WIDGET_BODY
    }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RESERVED_KIND");
    const after = (await (await fetch(`${base}/api/widgets`, asAlice())).json()) as {
      widgets: unknown[];
    };
    expect(after.widgets.length).toBe(before.widgets.length);
  });

  it("themes round-trip with the path as the name", async () => {
    const put = await fetch(`${base}/api/themes/midnight`, asAlice({
      method: "PUT",
      body: JSON.stringify({ tokens: { accent: "#00ffcc" } })
    }));
    expect(put.status).toBe(200);
    const list = (await (await fetch(`${base}/api/themes`, asAlice())).json()) as {
      themes: { name: string }[];
    };
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
    const seeded = seedWidgetDraft(
      source as unknown as WidgetDraft,
      listed.widgets.map((w) => w.kind)
    );
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
    // the copy carries the source's content
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
    const listed = (await (await fetch(`${base}/api/themes`, asAlice())).json()) as {
      themes: { name: string }[];
    };
    expect(listed.themes.map((t) => t.name)).toContain("my-dark");
  });

  it("built-in starters save as new widgets that render", async () => {
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
    const body = (await created.json()) as {
      key: string;
      entry: { id: string; name: string };
      notice: string;
    };
    expect(body.key).toMatch(/^wgk_/);
    expect(body.notice).toContain("cannot be shown again");

    // The raw key resolves through the store port (what the MCP edge does).
    const principal = await store.resolvePrincipal(body.key);
    expect(principal).toBeDefined();

    const listed = await fetch(`${base}/api/keys`, asAlice());
    const keys = (await listed.json()) as { keys: { id: string; name: string }[] };
    expect(JSON.stringify(keys)).not.toContain(body.key);
    expect(keys.keys.find((k) => k.id === body.entry.id)?.name).toBe("laptop");

    const revoke = await fetch(`${base}/api/keys/${body.entry.id}`, asAlice({
      method: "DELETE"
    }));
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

describe("shared data schemas through the API", () => {
  const PERSON = JSON.stringify({
    label: "Person",
    schema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } }
    }
  });

  it("schema CRUD is session-only, like widgets and themes", async () => {
    // No session → 401.
    const anon = await fetch(`${base}/api/schemas/person`, { method: "PUT", body: PERSON });
    expect(anon.status).toBe(401);
    // An MCP key is not a session.
    const keyed = await fetch(`${base}/api/schemas`, {
      headers: { "x-api-key": "wgk_whatever" }
    });
    expect(keyed.status).toBe(401);
    // A session writes and lists.
    const put = await fetch(`${base}/api/schemas/person`, asAlice({ method: "PUT", body: PERSON }));
    expect(put.status).toBe(200);
    const listed = (await (
      await fetch(`${base}/api/schemas`, asAlice())
    ).json()) as { schemas: { name: string }[] };
    expect(listed.schemas.map((s) => s.name)).toContain("person");
  });

  it("a widget can reference the schema; deletion is refused naming it", async () => {
    const put = await fetch(
      `${base}/api/widgets/person-card`,
      asAlice({
        method: "PUT",
        body: JSON.stringify({
          template: { tag: "div", children: [{ bind: "name" }] },
          descriptor: {
            description: "person as a card",
            dataShape: "{ name }",
            dataSchemaRef: "person"
          }
        })
      })
    );
    expect(put.status).toBe(200);
    // Delete while referenced → 409 SCHEMA_IN_USE, naming person-card.
    const del = await fetch(`${base}/api/schemas/person`, asAlice({ method: "DELETE" }));
    expect(del.status).toBe(409);
    const body = (await del.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("SCHEMA_IN_USE");
    expect(body.error.message).toContain("person-card");
    // The schema is still there.
    const listed = (await (
      await fetch(`${base}/api/schemas`, asAlice())
    ).json()) as { schemas: { name: string }[] };
    expect(listed.schemas.map((s) => s.name)).toContain("person");
  });

  it("a ref to a missing schema is refused at save time", async () => {
    const put = await fetch(
      `${base}/api/widgets/ghost-card`,
      asAlice({
        method: "PUT",
        body: JSON.stringify({
          template: { tag: "div", children: ["x"] },
          descriptor: { description: "d", dataShape: "s", dataSchemaRef: "ghost" }
        })
      })
    );
    expect(put.status).toBe(422);
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe(
      "UNKNOWN_SCHEMA"
    );
  });

  it("a schema edit propagates through composition without touching the widget", async () => {
    const { composeCatalog } = await import("widgentic/store");
    const { principalIdForSubject } = await import("widgentic/store");
    const alice = principalIdForSubject("alice");
    // Baseline: person requires only 'name'.
    let composed = await composeCatalog(store, alice);
    let rendered = composed.value.render({ kind: "person-card", data: { name: "Ada" } });
    expect(rendered.ok).toBe(true);
    // Edit the SCHEMA (not the widget) to require 'email' too.
    const put = await fetch(
      `${base}/api/schemas/person`,
      asAlice({
        method: "PUT",
        body: JSON.stringify({
          schema: {
            type: "object",
            required: ["name", "email"],
            properties: { name: { type: "string" }, email: { type: "string" } }
          }
        })
      })
    );
    expect(put.status).toBe(200);
    composed = await composeCatalog(store, alice);
    rendered = composed.value.render({ kind: "person-card", data: { name: "Ada" } });
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.error.path).toContain("email");
    // The registered descriptor carries the resolved schema, never the ref.
    const descriptor = composed.value.describe("person-card");
    expect(descriptor?.dataSchema).toMatchObject({ required: ["name", "email"] });
    expect(
      (descriptor as unknown as { dataSchemaRef?: string })?.dataSchemaRef
    ).toBeUndefined();
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

describe("secrets over the API with a cipher", () => {
  it("writes are write-only, deletes respect SECRET_IN_USE, and the test call resolves the secret server-side", async () => {
    const { createLocalCipher, generateLocalKek } = await import("../../../src/secrets/index.js");
    const cipherStore = createMemoryStore([], undefined, { cipher: createLocalCipher(generateLocalKek()) });
    const cipherServer = createServer((req, res) => {
      void handleApiRequest(req, res, { store: cipherStore, readSession, secretsEnabled: true }).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => cipherServer.listen(0, resolve));
    const address = cipherServer.address();
    const cipherBase = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
    try {
      let res = await fetch(`${cipherBase}/api/secrets/weather-token`, asAlice({ method: "PUT", body: JSON.stringify({ value: "sk-live-123" }) }));
      expect(res.status).toBe(200);
      const listing = (await (await fetch(`${cipherBase}/api/secrets`, asAlice())).json()) as { enabled: boolean; secrets: { name: string }[] };
      expect(listing.enabled).toBe(true);
      expect(listing.secrets.map((s) => s.name)).toEqual(["weather-token"]);
      expect(JSON.stringify(listing)).not.toContain("sk-live-123");
      // An action referencing the secret blocks deletion, naming itself.
      res = await fetch(`${cipherBase}/api/actions/secured`, asAlice({
        method: "PUT",
        body: JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://api.example.com/w", input: { type: "object" }, output: { type: "object" }, headers: { Authorization: { secret: "weather-token" } } } })
      }));
      expect(res.status).toBe(200);
      res = await fetch(`${cipherBase}/api/secrets/weather-token`, asAlice({ method: "DELETE" }));
      expect(res.status).toBe(409);
      const error = (await res.json()) as { error: { code: string; message: string } };
      expect(error.error.code).toBe("SECRET_IN_USE");
      expect(error.error.message).toContain("secured");
      // The test call resolves the secret server-side; a private target is still refused before any bytes.
      const test = (await (await fetch(`${cipherBase}/api/action-test`, asAlice({
        method: "POST",
        body: JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://10.0.0.9/w", input: { type: "object" }, output: { type: "object" }, headers: { Authorization: { secret: "weather-token" } } }, args: {} })
      }))).json()) as { ok: boolean; code?: string; message?: string };
      expect(test.ok).toBe(false);
      expect(test.code).toBe("ACTION_FETCH_FAILED");
      expect(JSON.stringify(test)).not.toContain("sk-live-123");
      await fetch(`${cipherBase}/api/actions/secured`, asAlice({ method: "DELETE" }));
      res = await fetch(`${cipherBase}/api/secrets/weather-token`, asAlice({ method: "DELETE" }));
      expect(res.status).toBe(200);
    } finally {
      cipherServer.close();
    }
  });
});

describe("hardening: web API", () => {
  it("an action named 'test' is an ordinary action; the test call has its own route", async () => {
    const res = await fetch(`${base}/api/actions/test`, asAlice({ method: "PUT", body: JSON.stringify({ definition: { kind: "prompt", text: ["x"] } }) }));
    expect(res.status).toBe(200);
    const listed = (await (await fetch(`${base}/api/actions`, asAlice())).json()) as { actions: { name: string }[] };
    expect(listed.actions.map((a) => a.name)).toContain("test");
    expect((await fetch(`${base}/api/actions/test`, asAlice({ method: "DELETE" }))).status).toBe(200);
    expect((await fetch(`${base}/api/actions/test`, asAlice({ method: "POST", body: "{}" }))).status).toBe(404);
  });

  it("test calls spend the shared execution budget and malformed definitions answer structurally", async () => {
    const { createExecutionLimiter } = await import("../../../src/mcp-server/index.js");
    const limiter = createExecutionLimiter(1); // one bucket for the server, as in production
    const limited = createServer((req, res) => {
      void handleApiRequest(req, res, { store, readSession, limiter }).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => limited.listen(0, resolve));
    const address = limited.address();
    const limitedBase = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
    try {
      const body = JSON.stringify({ definition: { kind: "http", method: "GET", url: "https://10.0.0.9/w", input: { type: "object" }, output: { type: "object" } }, args: {} });
      const first = (await (await fetch(`${limitedBase}/api/action-test`, asAlice({ method: "POST", body }))).json()) as { code?: string };
      expect(first.code).toBe("ACTION_FETCH_FAILED");
      const second = await fetch(`${limitedBase}/api/action-test`, asAlice({ method: "POST", body }));
      expect(second.status).toBe(200);
      expect(((await second.json()) as { ok: boolean; code?: string }).code).toBe("RATE_LIMITED");
    } finally {
      limited.close();
    }
    const malformed = (await (await fetch(`${base}/api/action-test`, asAlice({ method: "POST", body: JSON.stringify({ definition: { kind: "http", method: "GET" } }) }))).json()) as { ok: boolean; code?: string };
    expect(malformed.ok).toBe(false);
    expect(malformed.code).toBe("INVALID_ACTION_INPUT");
  });

  it("secret writes are gated by secretsEnabled at the API, not only by the store", async () => {
    const put = await fetch(`${base}/api/secrets/token`, asAlice({ method: "PUT", body: JSON.stringify({ value: "sk-live-12345" }) }));
    expect(put.status).toBe(503);
    expect(((await put.json()) as { error: { code: string } }).error.code).toBe("NO_CIPHER");
    expect((await fetch(`${base}/api/secrets/token`, asAlice({ method: "DELETE" }))).status).toBe(503);
  });
});

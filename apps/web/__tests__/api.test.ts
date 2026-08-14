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

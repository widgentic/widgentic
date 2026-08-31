// @vitest-environment node
/**
 * The identity rules (self-host-example spec, "Identity resolves without an
 * identity provider") — the one part of this example where being wrong is a
 * security bug rather than a broken demo: the default single principal, the
 * inert-until-configured header, per-value isolation stable across a
 * reopen, and the fail-closed refusal.
 */
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthoringHttpHandler } from "@widgentic/mcp/authoring";
import { createSqliteStore } from "@widgentic/mcp/store/sqlite";
import type { WritableWidgetStore } from "@widgentic/mcp/store";
import { createIdentity } from "../identity.js";

const WIDGET_BODY = JSON.stringify({
  template: { tag: "div", children: [{ bind: "t" }] },
  descriptor: { description: "d", dataShape: "{ t }" }
});

let servers: Server[] = [];
let savedHeader: string | undefined;

afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
  if (savedHeader === undefined) delete process.env.WIDGENTIC_TRUSTED_USER_HEADER;
  else process.env.WIDGENTIC_TRUSTED_USER_HEADER = savedHeader;
});

async function rig(store: WritableWidgetStore): Promise<string> {
  const identity = await createIdentity(store);
  const handle = createAuthoringHttpHandler({ store }, (req) => identity.resolve(req));
  const server = createServer((req, res) => {
    void handle(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  return `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
}

function withHeader(value: string | undefined): void {
  savedHeader = process.env.WIDGENTIC_TRUSTED_USER_HEADER;
  if (value === undefined) delete process.env.WIDGENTIC_TRUSTED_USER_HEADER;
  else process.env.WIDGENTIC_TRUSTED_USER_HEADER = value;
}

describe("single-principal mode (no identity configuration)", () => {
  it("every request is one fixed principal, and a spoofed header is inert", async () => {
    withHeader(undefined);
    const store = createSqliteStore(join(mkdtempSync(join(tmpdir(), "wg-id-")), "s.db"));
    const base = await rig(store);
    // Two callers, one carrying the header nobody configured.
    const put = await fetch(`${base}/api/widgets/anyone`, { method: "PUT", body: WIDGET_BODY });
    expect(put.status).toBe(200);
    const spoofed = await fetch(`${base}/api/widgets`, { headers: { "x-forwarded-user": "mallory" } });
    expect(spoofed.status).toBe(200);
    // The spoofed request reads the SAME principal's catalog: the header
    // changed nothing, no account was created for mallory.
    expect(((await spoofed.json()) as { widgets: { kind: string }[] }).widgets.map((w) => w.kind)).toEqual(["anyone"]);
    // And no identity routes exist without a subject.
    expect((await fetch(`${base}/api/identities`)).status).toBe(404);
    store.close();
  });
});

describe("trusted-header mode", () => {
  it("each header value is its own isolated principal, stable across a reopen", async () => {
    withHeader("x-forwarded-user");
    const path = join(mkdtempSync(join(tmpdir(), "wg-id-")), "s.db");
    const store = createSqliteStore(path);
    const base = await rig(store);
    const asUser = (user: string, init: RequestInit = {}): RequestInit => ({
      ...init,
      headers: { "x-forwarded-user": user, ...(init.headers ?? {}) }
    });
    await fetch(`${base}/api/widgets/alices`, asUser("alice", { method: "PUT", body: WIDGET_BODY }));
    const bob = (await (await fetch(`${base}/api/widgets`, asUser("bob"))).json()) as { widgets: unknown[] };
    expect(bob.widgets).toEqual([]);
    const alice = (await (await fetch(`${base}/api/widgets`, asUser("alice"))).json()) as { widgets: { kind: string }[] };
    expect(alice.widgets.map((w) => w.kind)).toEqual(["alices"]);
    store.close();
    // A new store over the same file: the same header value resolves to the
    // same account and its entries.
    const reopened = createSqliteStore(path);
    const again = await rig(reopened);
    const back = (await (await fetch(`${again}/api/widgets`, asUser("alice"))).json()) as { widgets: { kind: string }[] };
    expect(back.widgets.map((w) => w.kind)).toEqual(["alices"]);
    reopened.close();
  });

  it("fails closed: a request without the header is refused, never served the default", async () => {
    withHeader("x-forwarded-user");
    const store = createSqliteStore(join(mkdtempSync(join(tmpdir(), "wg-id-")), "s.db"));
    const base = await rig(store);
    for (const init of [{}, { headers: { "x-forwarded-user": "  " } }] as RequestInit[]) {
      const res = await fetch(`${base}/api/widgets`, init);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NO_PRINCIPAL");
    }
    store.close();
  });
});

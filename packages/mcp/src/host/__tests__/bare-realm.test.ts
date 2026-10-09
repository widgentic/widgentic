/**
 * The host bundle in a bare realm: a V8 context with ECMAScript built-ins
 * and Intl only — no URL, process, Buffer or require — which is what an
 * embedded engine offers. The bundle is built in memory with the shipping
 * options and must reproduce the conformance corpus byte for byte.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { buildHostBundleText, hostBundleAsExpression } from "../../../scripts/bundle-host.mjs";
import type { WidgenticHost } from "../index.js";

interface Corpus {
  config: string;
  cases: (
    | { name: string; op: "call"; tool: string; args: string; slim: boolean; output: string }
    | { name: string; op: "appTemplate"; output: string }
    | { name: string; op: "resources"; output: string }
    | { name: string; op: "widgetPage"; kind: string; output: string }
  )[];
}

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "conformance.json"), "utf8")) as Corpus;
const manifest = JSON.parse(readFileSync(join(here, "..", "..", "..", "package.json"), "utf8")) as { version: string };

let realm: vm.Context;
let globalsBefore: string[];
let createHost: (config: string) => WidgenticHost;
let host: WidgenticHost;

function globalNames(): string[] {
  return (vm.runInContext("Object.getOwnPropertyNames(globalThis)", realm) as string[]).slice().sort();
}

beforeAll(async () => {
  const expression = await hostBundleAsExpression(await buildHostBundleText());
  realm = vm.createContext({});
  globalsBefore = globalNames();
  const namespace = vm.runInContext(expression, realm) as { createWidgenticHost: (config: string) => WidgenticHost };
  createHost = namespace.createWidgenticHost;
  host = createHost(corpus.config);
}, 60_000);

describe("host bundle in a bare realm", () => {
  it("runs without the globals an embedded engine lacks", () => {
    expect(vm.runInContext("[typeof URL, typeof process, typeof Buffer, typeof require].join()", realm)).toBe(
      "undefined,undefined,undefined,undefined"
    );
    expect(createHost("{}").problems()).toBe("[]");
  });

  it("composes the corpus configuration, http-action templates included", () => {
    expect(host.problems()).toBe("[]");
    const kinds = JSON.parse(
      (JSON.parse(host.call("list_widgets", "{}", false)) as { content: { text: string }[] }).content[0]?.text ?? "[]"
    ) as { kind: string }[];
    expect(kinds.map((entry) => entry.kind)).toContain("weather");
  });

  it("reports the manifest version it was built from", () => {
    expect(host.version()).toBe(manifest.version);
  });

  describe("reproduces the conformance corpus", () => {
    for (const entry of corpus.cases) {
      it(entry.name, () => {
        const output =
          entry.op === "call"
            ? host.call(entry.tool, entry.args, entry.slim)
            : entry.op === "appTemplate"
              ? host.appTemplate()
              : entry.op === "resources"
                ? host.resources()
                : host.widgetPage(entry.kind);
        expect(output).toBe(entry.output);
      });
    }
  });

  it("carries nothing from one call to the next", () => {
    const a = JSON.stringify({ widget: "card", data: { title: "TENANT-A-7f3e", fields: { secret: "only-in-a" } } });
    const b = JSON.stringify({ widget: "table", data: [{ name: "tenant b" }] });
    host.call("render_widget", a, false);
    const afterA = host.call("render_widget", b, false);
    expect(afterA).toBe(createHost(corpus.config).call("render_widget", b, false));
    expect(afterA).not.toContain("TENANT-A-7f3e");
    expect(afterA).not.toContain("only-in-a");
  });

  it("leaves the realm's globals untouched, URL included", () => {
    expect(globalNames()).toEqual(globalsBefore);
    expect(vm.runInContext("typeof URL", realm)).toBe("undefined");
  });
});

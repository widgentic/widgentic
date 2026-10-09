/**
 * The conformance corpus of the runtime-neutral host (`@widgentic/mcp/host`).
 *
 * Inputs cover every served tool, every built-in kind, groups, themes,
 * contract errors, hint diagnostics, value formats in several locales, URL
 * edge cases, the example template widgets (an http and a prompt action
 * among them) and the documents the host serves. Outputs are recorded from
 * the host facade running from SOURCE in Node — native `URL`, Node's ICU —
 * and every other runtime must reproduce them byte for byte: the bundle in a
 * bare realm (packages/mcp/src/host/__tests__) and the .NET package
 * (dotnet/tests). `npm test` fails when the committed corpus is stale.
 *
 * Also derives the .NET sample's widget files from the example widgets, in
 * the designer's export shape.
 *
 * Run: npm run conformance:generate
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCatalog } from "@widgentic/core";
import { createWidgenticHost } from "@widgentic/mcp/host";
import { customWidgets } from "@widgentic-examples/mcp-server/widgets";

const here = dirname(fileURLToPath(import.meta.url));
export const CORPUS_PATH = join(here, "..", "packages", "mcp", "src", "host", "__tests__", "conformance.json");
export const SAMPLE_WIDGETS_DIR = join(here, "..", "dotnet", "samples", "Widgentic.Sample.Stdio", "widgets");

export type ConformanceCase =
  | { name: string; op: "call"; tool: string; args: string; slim: boolean; output: string }
  | { name: string; op: "appTemplate"; output: string }
  | { name: string; op: "resources"; output: string }
  | { name: string; op: "widgetPage"; kind: string; output: string };

export interface Corpus {
  generatedBy: string;
  config: string;
  cases: ConformanceCase[];
}

/** The designer's widget export shape, key order included. */
function exportShape(widget: (typeof customWidgets)[number]): Record<string, unknown> {
  return {
    kind: widget.kind,
    template: widget.template,
    descriptor: widget.descriptor,
    ...(widget.load === undefined ? {} : { load: widget.load })
  };
}

/** Bind formats in several locales: where engines' Intl data would diverge first. */
const formatsWidget = {
  kind: "corpus-formats",
  template: {
    tag: "div",
    attrs: { class: "wg-corpus-formats" },
    children: [
      { tag: "p", children: [{ bind: "amount", format: { type: "currency", currency: "CAD", locale: "fr-CA" } }] },
      { tag: "p", children: [{ bind: "amount", format: { type: "currency", currency: "CAD", locale: "en-CA" } }] },
      {
        tag: "p",
        children: [{ bind: "amount", format: { type: "currency", currency: "EUR", locale: "de-DE", currencyDisplay: "code" } }]
      },
      { tag: "p", children: [{ bind: "amount", format: { type: "currency", currency: "JPY", locale: "ja-JP", currencyDisplay: "symbol" } }] },
      { tag: "p", children: [{ bind: "amount", format: { type: "number", decimals: 1, locale: "fr-CA" } }] },
      { tag: "p", children: [{ bind: "amount", format: { type: "number" } }] },
      { tag: "p", children: [{ bind: "when", format: { type: "date", pattern: "yyyy-MM-dd HH:mm" } }] }
    ]
  },
  descriptor: {
    description: "Corpus: bind formats.",
    dataExample: { amount: 1234.5, when: "2026-10-08T12:34:00Z" }
  }
};

/** Attribute URLs through the scheme allowlist: links, prefixes, images. */
const linksWidget = {
  kind: "corpus-links",
  template: {
    tag: "div",
    attrs: { class: "wg-corpus-links" },
    children: [
      { tag: "a", attrs: { href: { bind: "url" } }, children: [{ bind: "label" }] },
      { tag: "a", attrs: { href: { bind: "slug", prefix: "https://example.com/items/" } }, children: ["item"] },
      { tag: "img", attrs: { src: { bind: "image" }, alt: "corpus" } }
    ]
  },
  descriptor: {
    description: "Corpus: URL attributes.",
    dataExample: { url: "https://example.com/a?b=1#c", label: "Example", slug: "42", image: "https://example.com/i.png" }
  }
};

/** A widget whose data schema is a shared-schema reference, resolved at composition. */
const schemaWidget = {
  kind: "corpus-person",
  template: { tag: "p", children: ["Name: ", { bind: "name" }] },
  descriptor: {
    description: "Corpus: a widget bound to the shared schema 'person'.",
    dataSchemaRef: "person",
    dataExample: { name: "Ada" }
  }
};

const config = {
  widgets: [...customWidgets.map(exportShape), formatsWidget, linksWidget, schemaWidget],
  themes: [{ name: "corpus-brand", label: "Corpus brand", tokens: { accent: "#0b6e4f" } }],
  schemas: [
    {
      name: "person",
      description: "A person.",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
    }
  ]
};

const URL_ROWS = [
  { name: "Plain", site: "https://example.com/path?q=1#frag", photo: "https://example.com/img/a.png?size=2" },
  { name: "IDN", site: "https://bücher.example/straße", photo: "https://bücher.example/cover.JPG" },
  { name: "Encoded", site: "https://example.com/a%20b/c", photo: "https://example.com/a%2Fb.webp" },
  { name: "Port", site: "https://example.com:8443/x", photo: "https://example.com:8443/y.gif" },
  { name: "Userinfo", site: "https://user:pw@example.com/", photo: "https://example.com/../up.png" },
  { name: "Unsafe", site: "javascript:alert(1)", photo: "http://example.com/insecure.png" },
  { name: "Other schemes", site: "mailto:a@example.com", photo: "data:image/png;base64,iVBORw0KGgo=" },
  { name: "Not a URL", site: "example dot com", photo: "https://" }
];

/** Build the corpus: every case's output from the host facade in this process. */
export function buildCorpus(): Corpus {
  const configJson = JSON.stringify(config);
  const host = createWidgenticHost(configJson);
  const problems = JSON.parse(host.problems()) as unknown[];
  if (problems.length > 0) {
    throw new Error(`the corpus configuration must compose cleanly: ${host.problems()}`);
  }
  const cases: ConformanceCase[] = [];
  const call = (name: string, tool: string, args: unknown, slim = false): void => {
    const argsJson = typeof args === "string" ? args : JSON.stringify(args);
    cases.push({ name, op: "call", tool, args: argsJson, slim, output: host.call(tool, argsJson, slim) });
  };
  const render = (name: string, args: Record<string, unknown>, slim = false): void =>
    call(name, "render_widget", args, slim);

  for (const tool of ["list_widgets", "list_theme_tokens", "list_themes", "list_schemas", "get_authoring_guide"]) {
    call(`tool ${tool}`, tool, {});
  }
  for (const tool of ["execute_action", "list_actions", "constructor", ""]) {
    call(`unknown tool '${tool}'`, tool, {});
  }

  const builtins = createCatalog();
  for (const kind of builtins.kinds()) {
    const data = builtins.describe(kind)?.dataExample ?? null;
    render(`built-in ${kind}`, { widget: kind, data });
    render(`built-in ${kind} slim`, { widget: kind, data }, true);
  }
  const table = builtins.describe("table")?.dataExample ?? [];
  for (const format of ["both", "html", "widget", "page", "app"]) {
    render(`table format ${format}`, { widget: "table", data: table, format }, true);
  }

  const card = { title: "Quarterly", subtitle: "Q3", fields: { revenue: "1.2M" } };
  render("theme by name dark", { widget: "card", data: card, theme: "dark" });
  render("theme by name configured", { widget: "card", data: card, theme: "corpus-brand" });
  render("theme inline", { widget: "card", data: card, theme: { accent: "#c0ffee", bg: "#101010" } });
  render("theme unknown", { widget: "card", data: card, theme: "nope" });
  render("theme invalid inline", { widget: "card", data: card, theme: { notAToken: "x" } });

  render("error unknown widget", { widget: "nope", data: {} });
  render("error missing data", { widget: "card" });
  render("error bad format", { widget: "card", data: card, format: "pdf" });
  call("error args not an object", "render_widget", "[]");
  call("error args unparseable", "render_widget", "{");
  call("error args empty", "render_widget", {});

  render("hints misaimed", { widget: "table", data: [{ a: 1, b: 2 }], hints: { colums: ["a"] } });
  render("data as JSON string", { widget: "table", data: JSON.stringify([{ a: 1 }]) });
  render("group mixed", {
    widget: "group",
    data: {
      items: [
        { kind: "card", data: card, hints: { nope: 1 } },
        { kind: "tree", data: { label: "root", children: [{ label: "leaf" }] } },
        { kind: "corpus-formats", data: formatsWidget.descriptor.dataExample }
      ]
    },
    meta: { title: "Mixed" }
  });

  render("urls table", { widget: "table", data: URL_ROWS, hints: { links: { site: true } } });
  render("urls card", {
    widget: "card",
    data: { title: "Profile", avatar: "https://example.com/u/1.jpg", homepage: "https://example.com" },
    hints: { images: { avatar: "avatar" }, links: { homepage: true } }
  });
  for (const row of URL_ROWS) {
    render(`urls template ${row.name}`, {
      widget: "corpus-links",
      data: { url: row.site, label: row.name, slug: row.name, image: row.photo }
    });
  }

  for (const amount of [1234.5, "1234.5", -0.5, 0, 1e21, "n/a"]) {
    render(`formats ${JSON.stringify(amount)}`, {
      widget: "corpus-formats",
      data: { amount, when: "2026-10-08T12:34:00Z" }
    });
  }
  render("formats unzoned date", { widget: "corpus-formats", data: { amount: 1, when: "2026-10-08T23:59:00" } });

  const examples: [string, unknown][] = [
    ...customWidgets.map((widget): [string, unknown] => [widget.kind, widget.descriptor.dataExample ?? null]),
    [schemaWidget.kind, schemaWidget.descriptor.dataExample]
  ];
  for (const [widget, data] of examples) {
    render(`example ${widget}`, { widget, data });
    render(`example ${widget} slim`, { widget, data }, true);
  }

  cases.push({ name: "app template", op: "appTemplate", output: host.appTemplate() });
  cases.push({ name: "resources", op: "resources", output: host.resources() });
  for (const kind of ["card", "invoice", "nope", "<b>bold</b>"]) {
    cases.push({ name: `widget page ${kind}`, op: "widgetPage", kind, output: host.widgetPage(kind) });
  }

  const names = new Set<string>();
  for (const entry of cases) {
    if (names.has(entry.name)) throw new Error(`duplicate corpus case name '${entry.name}'`);
    names.add(entry.name);
  }
  return { generatedBy: "npm run conformance:generate", config: configJson, cases };
}

/** The .NET sample's widget files: one designer export per example widget. */
export function buildSampleWidgets(): Map<string, string> {
  return new Map(
    customWidgets.map((widget) => [`${widget.kind}.json`, `${JSON.stringify(exportShape(widget), null, 2)}\n`])
  );
}

export function writeCorpus(): void {
  mkdirSync(dirname(CORPUS_PATH), { recursive: true });
  writeFileSync(CORPUS_PATH, `${JSON.stringify(buildCorpus(), null, 2)}\n`);
  mkdirSync(SAMPLE_WIDGETS_DIR, { recursive: true });
  for (const file of readdirSync(SAMPLE_WIDGETS_DIR)) {
    if (file.endsWith(".json")) rmSync(join(SAMPLE_WIDGETS_DIR, file));
  }
  for (const [file, text] of buildSampleWidgets()) writeFileSync(join(SAMPLE_WIDGETS_DIR, file), text);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeCorpus();
  console.error(`wrote ${CORPUS_PATH} and ${SAMPLE_WIDGETS_DIR}`);
}

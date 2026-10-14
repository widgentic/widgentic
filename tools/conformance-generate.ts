/**
 * The conformance corpus of the runtime-neutral host (`@widgentic/mcp/host`).
 *
 * Inputs cover every served tool (the template's preview tool included), every built-in kind, groups, themes,
 * contract errors, hint diagnostics, value formats in several locales, the
 * text formats (plural rules in two locales) and a Markdown bind, card
 * field order, URL
 * edge cases, the example template widgets (an http and a prompt action
 * among them) and the documents the host serves, plus default themes chosen
 * by a settings record, each under its own named configuration (`configs`;
 * a case names the one it runs against). Outputs are recorded from
 * the host facade running from SOURCE in Node — native `URL`, Node's ICU —
 * and every other runtime must reproduce them byte for byte: the bundle in a
 * bare realm (packages/mcp/src/host/__tests__) and the .NET package
 * (dotnet/tests). `npm test` fails when the committed corpus is stale.
 *
 * Also derives the .NET sample's seed from the docker example's demo seed
 * (examples/docker/seed/demo.json): one file per widget, theme and shared
 * schema, plus its settings record, so the sample serves exactly what the
 * self-host demo does.
 *
 * Run: npm run conformance:generate
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCatalog } from "@widgentic/core";
import { createWidgenticHost } from "@widgentic/mcp/host";
import { customWidgets } from "@widgentic-examples/mcp-server/widgets";

const here = dirname(fileURLToPath(import.meta.url));
export const CORPUS_PATH = join(here, "..", "packages", "mcp", "src", "host", "__tests__", "conformance.json");
export const DOCKER_SEED_PATH = join(here, "..", "examples", "docker", "seed", "demo.json");
export const SAMPLE_SEED_DIR = join(here, "..", "dotnet", "samples", "Widgentic.Sample.Stdio", "seed");

/** `config`, when present, names the entry of `Corpus.configs` the case runs against; absent, the main one. */
export type ConformanceCase = { config?: string } & (
  | { name: string; op: "call"; tool: string; args: string; slim: boolean; output: string }
  | { name: string; op: "appTemplate"; output: string }
  | { name: string; op: "resources"; output: string }
  | { name: string; op: "widgetPage"; kind: string; output: string }
);

export interface Corpus {
  generatedBy: string;
  config: string;
  /** Further configurations by name: default themes from settings, and resource domains, one each. */
  configs: Record<string, string>;
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

/** The text formats and a Markdown bind: plural rules and code points, where engines could diverge. */
const textWidget = {
  kind: "corpus-text",
  template: {
    tag: "div",
    attrs: { class: "wg-corpus-text" },
    children: [
      { tag: "p", children: [{ bind: "items", format: { type: "count" } }] },
      {
        tag: "p",
        attrs: { title: { bind: "tags", format: { type: "join", separator: " · " } } },
        children: [{ bind: "people", format: { type: "join", field: "name", last: " and " } }]
      },
      { tag: "p", children: [{ bind: "title", format: { type: "truncate", length: 12 } }] },
      {
        tag: "p",
        children: [{ bind: "n", format: { type: "pluralize", forms: { zero: "No items", one: "{count} item", other: "{count} items" } } }]
      },
      {
        tag: "p",
        children: [
          {
            bind: "n",
            format: {
              type: "pluralize",
              locale: "pl",
              forms: { one: "{count} plik", few: "{count} pliki", many: "{count} plików", other: "{count} pliku" }
            }
          }
        ]
      },
      { tag: "div", children: [{ bind: "notes", markdown: true }] }
    ]
  },
  descriptor: {
    description: "Corpus: text formats and Markdown.",
    dataExample: {
      items: [1, 2, 3],
      tags: ["red", "", "green"],
      people: [{ name: "Ada" }, { name: "Lin" }, { name: "Grace" }],
      title: "Quarterly revenue summary 👍👍",
      n: 3,
      notes:
        "Intro with **bold**, *em*, _under_ and `code`.\nsnake_case stays.\n\n- one\n- two\n\n3. third\n4. fourth\n\nSee [docs](https://example.com/a_(b)) and \\*stars\\*."
    }
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
  widgets: [...customWidgets.map(exportShape), formatsWidget, textWidget, linksWidget, schemaWidget],
  themes: [
    { name: "corpus-brand", label: "Corpus brand", tokens: { accent: "#0b6e4f" } },
    {
      name: "corpus-styled",
      label: "Corpus styled",
      tokens: { accent: "#7a3cff" },
      styles: { ".wg-card-title": { "letter-spacing": "0.02em" }, ".wg-btn, .wg-link": { color: "var(--wg-accent)" } }
    }
  ],
  schemas: [
    {
      name: "person",
      description: "A person.",
      schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
    }
  ]
};

/** Themes the settings configurations choose from: a styled light theme, a styled dark one and a plain one. */
const SETTINGS_THEMES = [
  config.themes[0],
  config.themes[1],
  {
    name: "corpus-night",
    label: "Corpus night",
    tokens: { bg: "#101418", fg: "#e8eaed", accent: "#8ab4f8" },
    styles: { ".wg-card": { "border-style": "dashed" } }
  }
];

/** One configuration per source of declared resource domains, in the forms a person may type them. */
const DOMAIN_CONFIGS: Record<string, { resourceDomains?: string[]; settings?: { resourceDomains: string[] } }> = {
  "domains from the operator": { resourceDomains: ["assets.example.org", "https://*.cdn.example.net/"] },
  "domains from settings": { settings: { resourceDomains: ["CDN.example.com", "https://*.example.net/", "cdn.example.com"] } },
  "domains from both": {
    resourceDomains: ["assets.example.org"],
    settings: { resourceDomains: ["cdn.example.com", "https://assets.example.org"] }
  }
};

/** One configuration per way a settings record chooses default themes. */
const SETTINGS_CONFIGS: Record<string, Record<string, string>> = {
  "settings light default": { light: "corpus-styled" },
  "settings dark default": { dark: "corpus-night" },
  "settings two defaults with styles": { light: "corpus-styled", dark: "corpus-night" },
  "settings two defaults, one with styles": { light: "corpus-brand", dark: "corpus-night" },
  "settings one theme for both": { light: "corpus-styled", dark: "corpus-styled" }
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

  // Card field order: hints.fields picks and orders, a missing key skipped and a repeat rendered once.
  const ordered = {
    widget: "card",
    hints: { fields: ["role", "zzz", "company", "email", "role"], labels: { company: "Company" } },
    data: { title: "Olivia", fields: { avatar: "x", company: "Northwind", email: "o@example.com", role: "Designer" } }
  };
  render("field order card", ordered);
  render("field order card as a page", { ...ordered, format: "page" });
  call("field order card preview", "preview_widget", ordered);

  // Field labels: the card's keys and the table's headers (columns selected), image alt text included.
  const labelledCard = {
    widget: "card",
    data: { fields: { first_name: "Ada", order_total: 42, avatar_url: "https://cdn.example/a/ada.png" } },
    hints: { labels: { first_name: "First Name", order_total: "Order Total", avatar_url: "Avatar" }, images: { avatar_url: "avatar" } }
  };
  const labelledTable = {
    widget: "table",
    data: [{ first_name: "Ada", last_name: "Lovelace", id: 1 }, { first_name: "Alan", last_name: "Turing", id: 2 }],
    hints: { columns: ["last_name", "first_name"], labels: { first_name: "First Name", last_name: "Last Name" } }
  };
  for (const [label, args] of [["card", labelledCard], ["table", labelledTable]] as const) {
    render(`labels ${label}`, args);
    render(`labels ${label} as a page`, { ...args, format: "page" });
    call(`labels ${label} preview`, "preview_widget", args);
  }
  render("theme with styles", { widget: "card", data: card, theme: "corpus-styled" });
  render("theme with styles as a page", { widget: "card", data: card, theme: "corpus-styled", format: "page" });
  render("theme inline", { widget: "card", data: card, theme: { accent: "#c0ffee", bg: "#101010" } });
  render("theme unknown", { widget: "card", data: card, theme: "nope" });
  render("theme invalid inline", { widget: "card", data: card, theme: { notAToken: "x" } });

  render("error unknown widget", { widget: "nope", data: {} });
  render("error missing data", { widget: "card" });
  render("error bad format", { widget: "card", data: card, format: "pdf" });
  call("error args not an object", "render_widget", "[]");
  call("error args unparseable", "render_widget", "{");
  call("error args empty", "render_widget", {});
  render("error payload kind passed for widget", { kind: "card", data: card });

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

  // Text formats and Markdown: plural rules in two locales; the example and the hostile value also as a page and a preview.
  const text = textWidget.descriptor.dataExample;
  for (const [label, data] of [
    ["example", text],
    ["zero", { ...text, items: [], n: 0, people: [], title: "Short" }],
    ["one", { ...text, items: [1], n: 1, people: [{ name: "Ada" }] }],
    ["many", { ...text, n: 22, items: "n/a", people: "solo" }],
    ["polish five", { ...text, n: 5 }],
    ["hostile markdown", { ...text, notes: "<img src=x onerror=alert(1)> [x](javascript:alert(1)) **open *half # not a heading\n\n> not a quote\n\n![logo](https://example.com/logo.png)\n\n```js\nconst a = 1;\n```" }]
  ] as const) {
    render(`text ${label}`, { widget: "corpus-text", data });
    if (label === "example" || label === "hostile markdown") {
      render(`text ${label} as a page`, { widget: "corpus-text", data, format: "page" });
      call(`text ${label} preview`, "preview_widget", { widget: "corpus-text", data });
    }
  }

  const examples: [string, unknown][] = [
    ...customWidgets.map((widget): [string, unknown] => [widget.kind, widget.descriptor.dataExample ?? null]),
    [schemaWidget.kind, schemaWidget.descriptor.dataExample]
  ];
  for (const [widget, data] of examples) {
    render(`example ${widget}`, { widget, data });
    render(`example ${widget} slim`, { widget, data }, true);
  }

  // The template's own preview tool, called while a render's input streams.
  call("preview built-in partial", "preview_widget", { widget: "card", data: { title: "Q" } });
  call("preview stored kind missing required data", "preview_widget", { widget: "invoice", data: { customer: "Ada" } });
  call("preview group partial", "preview_widget", {
    widget: "group",
    data: { items: [{ kind: "card", data: { title: "A" } }, { kind: "corpus-formats", data: { amount: 1 } }] }
  });
  call("preview half-streamed theme ignored", "preview_widget", { widget: "card", data: card, theme: { accent: "#0b" } });
  call("preview named theme", "preview_widget", { widget: "card", data: card, theme: "corpus-brand" });
  call("preview theme with styles", "preview_widget", { widget: "card", data: card, theme: "corpus-styled" });
  call("preview no data yet", "preview_widget", { widget: "table" });
  call("preview image never fetched", "preview_widget", {
    widget: "card",
    data: { title: "P", avatar: "https://example.com/u/1.jpg" },
    hints: { images: { avatar: "avatar" } }
  });
  call("preview unknown kind", "preview_widget", { widget: "nope", data: {} });
  call("preview missing widget", "preview_widget", { data: {} });
  call("preview payload kind passed for widget", "preview_widget", { kind: "card", data: {} });

  // Default themes from settings: a render, a page, a preview, the listing and a widget page each.
  const configs: Record<string, string> = {};
  for (const [label, defaultThemes] of Object.entries(SETTINGS_CONFIGS)) {
    const json = JSON.stringify({ themes: SETTINGS_THEMES, settings: { defaultThemes } });
    const settingsHost = createWidgenticHost(json);
    if (settingsHost.problems() !== "[]") {
      throw new Error(`the '${label}' configuration must compose cleanly: ${settingsHost.problems()}`);
    }
    configs[label] = json;
    const run = (name: string, tool: string, args: unknown): void => {
      const argsJson = JSON.stringify(args);
      cases.push({ config: label, name: `${label}: ${name}`, op: "call", tool, args: argsJson, slim: false, output: settingsHost.call(tool, argsJson, false) });
    };
    run("render", "render_widget", { widget: "card", data: card });
    run("page", "render_widget", { widget: "card", data: card, format: "page" });
    run("preview", "preview_widget", { widget: "card", data: card });
    run("explicit theme wins", "render_widget", { widget: "card", data: card, theme: "corpus-brand" });
    run("listing", "list_themes", {});
    cases.push({ config: label, name: `${label}: widget page`, op: "widgetPage", kind: "card", output: settingsHost.widgetPage("card") });
  }

  // Resource domains: the embedding server's own, a settings section, and both, as `resources()` declares them.
  for (const [label, domains] of Object.entries(DOMAIN_CONFIGS)) {
    const json = JSON.stringify(domains);
    const domainHost = createWidgenticHost(json);
    if (domainHost.problems() !== "[]") {
      throw new Error(`the '${label}' configuration must compose cleanly: ${domainHost.problems()}`);
    }
    configs[label] = json;
    cases.push({ config: label, name: `${label}: resources`, op: "resources", output: domainHost.resources() });
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
  return { generatedBy: "npm run conformance:generate", config: configJson, configs, cases };
}

/** The seed sections the .NET sample loads, by the field that names an entry; a render-only host binds no shared actions. */
const SEED_SECTIONS = { widgets: "kind", themes: "name", schemas: "name" } as const;

/** The .NET sample's seed: each demo-seed entry as `<section>/<name>.json`, and its settings record as `settings.json`, keyed by relative path. */
export function buildSampleSeed(): Map<string, string> {
  const seed = JSON.parse(readFileSync(DOCKER_SEED_PATH, "utf8")) as Record<string, unknown>;
  const files = new Map<string, string>();
  for (const [section, key] of Object.entries(SEED_SECTIONS)) {
    const entries = seed[section];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as Record<string, unknown>[]) {
      files.set(`${section}/${String(entry[key])}.json`, `${JSON.stringify(entry, null, 2)}\n`);
    }
  }
  if (seed.settings !== undefined) files.set("settings.json", `${JSON.stringify(seed.settings, null, 2)}\n`);
  return files;
}

export function writeCorpus(): void {
  mkdirSync(dirname(CORPUS_PATH), { recursive: true });
  writeFileSync(CORPUS_PATH, `${JSON.stringify(buildCorpus(), null, 2)}\n`);
  rmSync(SAMPLE_SEED_DIR, { recursive: true, force: true });
  for (const [file, text] of buildSampleSeed()) {
    const target = join(SAMPLE_SEED_DIR, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeCorpus();
  console.error(`wrote ${CORPUS_PATH} and ${SAMPLE_SEED_DIR}`);
}

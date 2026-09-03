# @widgentic/webmcp

> **Beta.** The API may change in minor versions before 1.0. Built against the
> WebMCP specification's `document.modelContext` shape; see "Browsers" below
> for what has been exercised where.

Expose the mounted widgentic designers as [WebMCP](https://github.com/webmachinelearning/webmcp)
tools, so a browser-side agent — ChatGPT Desktop's browser, Chrome or Edge in
the WebMCP origin trial — can read and edit the drafts the person is looking
at. **Agents edit, people save**: no tool here persists anything; the host's
save controls stay the only write path. Browser-safe, no network I/O, depends
only on `@widgentic/core` and `@widgentic/designer`.

```sh
npm install @widgentic/webmcp
```

One call after mounting. Sources are **getters**, resolved on every tool call,
because hosts remount designers when the person switches tabs:

```ts
import { exposeDesigners } from "@widgentic/webmcp";

const agentTools = await exposeDesigners({
  widget: () => widgetDesigner,          // a DesignerHandle, or undefined while unmounted
  theme: () => { showTab("theme"); return themeDesigner; },  // a getter may mount first
  schema: () => schemaDesigner,
  action: () => actionDesigner
});

// Tell the person only when it matters; everyone else sees the page unchanged.
if (agentTools.supported) status.textContent = "WebMCP tools are available in this browser — your agent can draft into these designers; you save.";

// Later, e.g. on sign-out: every tool disappears together.
agentTools.dispose();
```

In a browser without a model context the call resolves with
`supported: false`, registers nothing and throws nothing — the page is
unchanged.

## The tools

Names are `<prefix>_<suffix>`; the prefix defaults to `widgentic` (`{ prefix }`
in the options). Only designers you supply a source for get tools; the three
reference tools are always present. Every editing tool's description carries a
summary of the template DSL and the style rules, so an agent that reads only
the tool list drafts by the same rules as one that read the guide.

| Tool | Read-only | Does |
|---|---|---|
| `widget_draft_get` | yes | The open widget definition in export shape `{ kind, template, descriptor, load? }` plus the designer's diagnostics |
| `widget_draft_load` | | Replace the draft with a definition, through the designer's validation |
| `widget_example_data_set` | | Replace `descriptor.dataExample` — what the preview renders; the example-vs-schema verdict comes back in the diagnostics |
| `widget_theme_set` | | Set the preview theme tokens of the draft |
| `theme_get` / `theme_load` | get | The theme entry `{ name, label?, description?, tokens }` |
| `theme_tokens_set` | | Merge tokens into the open entry (`{ tokens, remove? }`), validated as a whole |
| `schema_get` / `schema_load` | get | The shared data-schema entry `{ name, label?, description?, schema }` |
| `action_get` / `action_load` | get | The action entry `{ name, label?, description?, definition }` |
| `authoring_guide` | yes | The full authoring contract — widget shape, template DSL (`bind`/`each`/`when`, `map`/`prefix`/`format`), safety, styles, data schemas, theme tokens, limits — derived from the validators |
| `widget_definition_check` | yes | Validate a definition without touching the designer; the same errors and diagnostics the load would return |
| `theme_token_specs` | yes | Every `--wg-*` token with type, default, purpose and fallback, from the exported specs |

Every tool resolves to MCP-shaped text content carrying one JSON document with
a boolean `ok`:

```json
{ "content": [{ "type": "text", "text": "{\"ok\":false,\"code\":\"REJECTED\",\"errors\":[\"template: … \"]}" }] }
```

Refusals are results, never rejections: `NOT_MOUNTED` (the source returned
nothing), `INVALID_INPUT` (with the `argument`), `REJECTED` (with the
designer's own `errors`). Read tools carry `annotations.readOnlyHint`, so
agents run them without a confirmation step.

Diagnostics come from the designer itself: the package subscribes to each
handle it sees and returns what the designer computed for the change a tool
made. Before the first change there is nothing to return, so `widget_draft_get`
derives them without the host's shared entries and says so with
`diagnosticsDerived: true`.

## What a host agent can still do

No tool here saves, and the guide tells the agent to leave the Save control to
the person unless asked. A host whose agent can operate the page — ChatGPT's
browser can click — may press Save itself, under the person's session and the
host's permission settings. The package cannot prevent that, and does not try:
the draft is visible in the designer before any such save, and the person's
request ("draft it, I will save") is what the agent follows. Say so in your
own UI if it matters to your users.

## Your own tools

`registerTools(tools, { modelContext?, signal? })` registers any descriptors in
the same shape under one abort signal; `exposeDesigners` accepts extra ones as
`{ tools }` and reports them in the same result. Build results with
`okResult()` / `failResult()` so hosts and agents see one vocabulary.
`designerTools(sources, { prefix })` returns the descriptors without
registering — inspect them, or hand them to your own registration.

## Browsers

- **Native**: the package resolves `document.modelContext` (the specification;
  ChatGPT Desktop's browser) and falls back to `navigator.modelContext` (Chrome
  origin trial). An explicit `{ modelContext }` option wins over both.
- **Chrome 149+ / Edge 150 without a token**: enable
  `chrome://flags/#enable-webmcp-testing`, or launch with
  `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` and drive the tools
  from `navigator.modelContextTesting.getTools()` / `executeTool()`.
- **Polyfills**: nothing is bundled — a polyfill supplies the API, not the
  agent, and cannot make Firefox or Safari agent-capable. If you want
  extension-based agents (for example `@mcp-b/webmcp-polyfill`, which installs
  `document.modelContext` and defers to a native one), load it **before** the
  `exposeDesigners` call; the resolver finds whatever the page has.

Tools must be registered on the top-level page; browsers do not read tools from
iframes.

# Backlog

Unscheduled work for the public packages, examples and docs. Nothing here is
committed to; an item becomes work when an OpenSpec change picks it up.

- **Picking an item.** `/opsx:propose` names the ID in its proposal; the entry
  is deleted when that change archives (the archive keeps the history).
- **Adding an item.** Review follow-ups, deferred design decisions and live
  findings too big for the in-flight change land here with their origin.
  Each entry states the problem, a direction, what it touches (specs,
  packages, invariants from `CLAUDE.md`) and where it came from, and goes
  into one of the two parts below.
- **Deciding against an item.** Move it to *Not adopted* with the reason, so
  it is not re-proposed.
- **Scope.** Work for the private `widgentic/apps` repository belongs in its
  own backlog; an entry here names the apps side only when a package change
  has to come first.

The backlog has two parts:

1. **widgentic itself.** Fixes and features whose value stands without any
   other project: the packages, the server, the designers and the docs as
   they are. An idea borrowed from another project lands here when widgentic
   would want it on its own.
2. **Pairing with other technologies.** Work whose value depends on another
   protocol, framework or output surface (AG-UI, A2UI, third-party
   renderers, email and image channels), including changes to widgentic made
   mainly to line up with them, and the borrowed ideas we decided against.

Priority: **P1** next up, **P2** worth a change soon, **P3** when a real need
appears. Size: **S** one small change, **M** one change with spec deltas,
**L** several changes or cross-repo. Sizes are rough.

## Summary

**Part 1 · widgentic itself**

| ID | Item | Priority | Size | Origin |
|---|---|---|---|---|
| AGT-1 | Measure and publish the token footprint | P1 | S | json-render comparison |
| ACT-1 | Bounded input for actions | P1 | L | Backlog; A2UI, AG-UI, json-render comparisons |
| ACT-3 | Transport-free `execute_action` failure texts | P2 | S | `agent-visible-actions` review |
| DSL-1 | Presentational `format` types | P2 | S | json-render comparison |
| DSL-2 | Markdown bind mode | P3 | M | A2UI comparison |
| DSL-3 | A contract version marker | P3 | S | AG-UI comparison |
| AGT-2 | Lossless auto-fix, reported | P3 | M | json-render comparison |
| AGT-3 | Payload inspector in the designer | P3 | M | json-render comparison |
| AGT-4 | Wire input schemas from the exported definitions | P3 | M | `mcp-sdk-v2` design |
| STO-1 | DEK unwrap cache | P3 | M | Backlog |
| STO-2 | Merge two populated accounts | P3 | L | Backlog |
| NET-1 | Actions and image inlining for the .NET host | P2 | L | `dotnet-host` design |
| RND-5 | More image sources per render | P3 | M | Owner finding, v82 |

**Part 2 · Pairing with other technologies**

| ID | Item | Priority | Size | Origin |
|---|---|---|---|---|
| IOP-1 | Probe AG-UI's MCP Apps middleware | P1 | S | AG-UI comparison |
| IOP-5 | Public conformance fixtures | P2 | S | A2UI comparison |
| ACT-2 | RFC 6902 for the `patch` output mode | P2 | M | AG-UI, json-render comparisons |
| IOP-2 | Native renderer for AG-UI applications | P2 | M | AG-UI comparison |
| IOP-3 | A widgentic A2UI catalog | P2 | M | A2UI comparison |
| IOP-4 | `toA2UI` projection of the render tree | P2 | M | A2UI comparison |
| IOP-6 | Email and image output formats | P3 | L | json-render comparison |
| DOC-1 | Publish the comparison pages | `[USER]` | S | Landscape comparison |

Part 1's P1 items are the cheap measurement behind the main efficiency claim
and the largest functional gap the comparisons found. Part 2's P1 is a probe
with no product code that decides how much of the AG-UI work is needed.
"Backlog" as an origin means the list previously kept in `CLAUDE.md`; the
comparison pages are `docs/compare/*.mdx`, dated 2026-09-10 and hidden:
they stay out of the docs navigation, site search and search engines, but
are reachable by direct URL.

## Part 1 · widgentic itself

### Actions and input

#### ACT-1 · Bounded input for actions — P1, L

- **Problem.** A widget cannot collect input from its reader: http action
  arguments come only from data resolved at render time. The comparisons rank
  this the largest functional gap. A2UI has five two-way-bound inputs with
  validators, json-render has two-way binding and `validateForm`, and AG-UI
  interrupts carry a `responseSchema` the application renders as a form.
- **Direction.** Input elements (text, number, select, checkbox, date) bound
  two-way into a widget-local model. `action.input` may read from that model.
  A closed validator set (`required`, `pattern`, length bounds, `numeric`,
  `email`) disables the button with a reason and never runs code. The http
  action's declared input schema stays the server-side gate. Prompt actions
  may place model values into the proposed text; steering must say that
  ChatGPT sends rather than prefills.
- **Touches.** `template-widgets`, `widget-actions`, `mcp-server`,
  `widget-designer`. The docs line "Not a forms library" changes. `form`,
  `input` and `select` already render (they are not on the tag denylist),
  but only as inert elements with one-way attribute binds; nothing reads
  their values, and a submission must never navigate the frame. Kept
  invariants: the
  iframe never touches the network, declared args only, author-fixed query
  and headers win.
- **Origin.** Backlog ("form inputs / client-side arg collection"). A2UI
  comparison, idea 3. AG-UI comparison, interrupts. json-render comparison,
  forms.

#### ACT-3 · Transport-free `execute_action` failure texts — P2, S

- **Problem.** `list_actions` withholds URLs, headers and query, yet
  guarded-fetch failure reasons can reveal the transport in tool text. The
  refusal names the host (`target '<host>' is not a public address`), a
  network failure forwards Node's error text (DNS errors include the
  hostname), and a non-2xx answer echoes up to 300 characters of the target's
  body.
- **Direction.** For execute-scoped callers, map each reason to a fixed,
  transport-free text with a stable code. Keep the detailed reason for the
  server's own logs.
- **Touches.** `widget-actions`, `mcp-server`;
  `packages/mcp/src/server/guarded-fetch.ts`.
- **Origin.** 2026-09-01 `agent-visible-actions` review (task 7.6).

### Template DSL and the authoring contract

#### DSL-1 · Presentational `format` types — P2, S

- **Problem.** Authors want an item count, a list joined into a sentence, a
  truncated description or a pluralized label, and the DSL has none of these.
- **Direction.** Add `count`, `join` (author separator), `truncate` (author
  length and ellipsis) and `pluralize` (author forms such as `{ one, other }`)
  to the closed `format` vocabulary. Each presents a bound value at render
  time; the author supplies every literal; nothing evaluates.
- **Touches.** `template-widgets`, and `widget-catalog` if `fieldFormat` gets
  them too. The guide and the Reference pages regenerate from the validators.
- **Origin.** json-render comparison, idea 1 (its `$count`, `$join`,
  `$truncate` and `$pluralize` directives); landscape step 8.

#### DSL-2 · Markdown bind mode — P3, M

- **Problem.** Long-form text renders as one text node. Markdown in A2UI's
  `Text` component is a large part of its expressiveness.
- **Direction.** `{ "bind": "notes", "markdown": true }` parses a small safe
  subset (paragraphs, emphasis, lists, inline code, links) into `WidgetNode`s
  with an in-house parser. Never `innerHTML`. Links pass the URL-scheme
  guard; parsed nodes count against the node budget.
- **Touches.** `template-widgets`, `widget-catalog`. The documented rule
  "bindings only ever produce text and attribute strings" must be restated as
  "the parser, not the value, chooses tags": a spec change.
- **Origin.** A2UI comparison, idea 4; landscape step 6.

#### DSL-3 · A contract version marker — P3, S (investigate)

- **Problem.** A payload carries no version, so a host cannot log which
  contract generation it was given when a shape changes. Renderers ignoring
  unknown fields has been enough so far.
- **Direction.** Decide whether a marker is needed, and where. Inside `meta`
  leaves the top-level contract alone; a top-level field changes a product
  invariant.
- **Touches.** `widget-contract`, `mcp-widget-output`.
- **Origin.** AG-UI comparison (`protocolVersion` in its 1.0 draft).

### Agent-facing results

#### AGT-1 · Measure and publish the token footprint — P1, S

- **Problem.** "The agent sends a kind and its data, not a layout" is the
  main efficiency claim against A2UI and json-render, and it is unmeasured.
  json-render's own tracker reports about 4,300 tokens for an 18-component
  catalog prompt; the OpenUI report benchmarks spec formats.
- **Direction.** A `tools/` script counting tokens for `tools/list`,
  `list_widgets`, `get_authoring_guide`, and one render per built-in kind
  (request and model-facing result, slimmed and unslimmed), with the
  tokenizer named. A generated docs table; optionally a regression gate.
- **Touches.** `tools/`, `docs/`. The tokenizer is an exact-pinned
  devDependency.
- **Origin.** json-render comparison, idea 4; landscape step 8.

#### AGT-2 · Lossless auto-fix, reported — P3, M (investigate)

- **Problem.** Some invalid inputs have exactly one safe correction, such as
  a column name differing only by case, yet cost the agent a round trip.
- **Direction.** Apply only provably lossless corrections, render, and report
  each in the model-facing notes and `structuredContent.diagnostics` with a
  `fixed` marker. Everything else is rejected as today. Render-time payloads
  only: stored entries keep "refuse at the door".
- **Touches.** `mcp-server` (hint analysis, diagnostics), `widget-contract`.
  Risk: the payload drifts from what the model believes it sent unless the
  fix is visible to it.
- **Origin.** json-render comparison, idea 2 (`autoFixSpec` with lossless and
  lossy classes).

#### AGT-3 · Payload inspector in the designer — P3, M

- **Problem.** An author debugging a widget sees the preview, but not the
  resolved tree, the hint diagnostics or the action descriptors.
- **Direction.** A read-only inspector panel in the widget designer showing
  those beside the preview. No new server surface.
- **Touches.** `widget-designer`.
- **Origin.** json-render comparison, idea 6 (`@json-render/devtools`).

#### AGT-4 · Wire input schemas from the exported definitions — P3, M

- **Problem.** The SDK assembly declares `render_widget`, `execute_action` and
  `preview_widget` inputs as zod objects that mirror the JSON Schemas in
  `definitions.ts` by hand. Only the field descriptions are derived. A new
  field or constraint has to be written twice, and the `./host` bundle already
  serves the definitions' own schemas.
- **Direction.** SDK 2.x accepts any Standard JSON Schema, and its
  `fromJsonSchema` turns a JSON Schema into one. Register the exported
  definitions directly, and drop zod from the assembly (and perhaps from the
  peers, if ext-apps no longer needs it). Argument validation then moves from
  zod to the SDK's JSON Schema validator, so the error texts agents see for
  malformed arguments change. Check them against the handler's own
  structured errors.
- **A finding that belongs here.** On the `mcp-sdk-v2` staging retest,
  Copilot's first `render_widget` call passed `kind` (the payload contract's
  field) instead of `widget`. It got the SDK's generic `widget: Invalid input:
  expected string, received undefined` and corrected itself. 0.9.0 answers the
  same call the same way, so it is not a regression. Once validation is ours,
  that error can name the mix-up in the tool's own vocabulary
  (`render_widget` takes `widget`; `kind` is the payload's field).
- **Touches.** `mcp-server` (the assembly), `package-distribution` (the zod
  peer), and the "derived, never restated" convention in `CLAUDE.md`.
- **Origin.** 2026-10-09 `mcp-sdk-v2` design, Non-Goals.

### Store, secrets and accounts

#### STO-1 · DEK unwrap cache — P3, M (investigate)

- **Problem.** Every secret resolution performs one vault unwrap.
- **Direction.** A cache keyed per principal, secret and `kekVersion`, with a
  short TTL and nothing shared across principals. Only after a measured need,
  because it cuts against "per-request composition, no caches".
- **Touches.** `widget-secrets`; `packages/mcp/src/secrets/envelope.ts`.
- **Origin.** Backlog.

#### STO-2 · Merge two populated accounts — P3, L

- **Problem.** Account linking aliases a second sign-in onto one account, but
  linking a subject that already owns a populated account is refused with
  `SUBJECT_IN_USE`. The person must empty one account first.
- **Direction.** An explicit merge moving widgets, themes, schemas, actions,
  secrets and keys under one principal, with name collisions resolved
  visibly (never "saved but vanished"). Absorbing a principal with live keys
  re-points their catalog, which is why the refusal exists today.
- **Touches.** `widget-store`: `linkSubject` and the adapters in
  `packages/mcp/src/store/`, with the persisted-shape rule. The flow and UI
  live in the apps repository's `widgentic-app` spec.
- **Origin.** Backlog.

### Rendering and the app template

#### RND-5 · More image sources per render — P3, M

- **Problem.** A render inlines at most 24 distinct image sources. Past that,
  the lowest-priority sources keep their URL, which the host sandbox blocks,
  so they show as empty boxes. An org tree with 30 distinct icon photos and a
  card cover left seven icons external in production (v82, 2026-10-09; the
  stderr note read `fetch cap: 7, byte budget: 0`).
- **Direction.** Fetch in priority-ordered waves of bounded concurrency and
  stop when the 3 MiB substituted-bytes budget is spent, then raise the count
  cap (for example to 64). Today the cap bounds memory, because all fetches
  run in parallel at up to 1 MiB each; with waves the budget bounds memory and
  the cap only bounds outbound requests. The cost is render latency: each
  wave waits for its slowest fetch (4 s guard), so waves need an overall
  deadline after which the rest stay external.
- **Touches.** `packages/mcp/src/server/inline-images.ts` (`resolveSources`),
  the `mcp-server` inlining requirement, the budget tests.
- **Origin.** Owner finding after the streaming-preview release (v82).

### Language hosts

#### NET-1 · Actions and image inlining for the .NET host — P2, L

- **Problem.** `Widgentic.Mcp` 0.1 is render-only. Http actions render
  disabled, `load` is inactive, and `execute_action`/`list_actions` are absent.
  Nothing inlines images, so strict MCP Apps hosts show external images only
  from operator-declared CSP domains.
- **Direction.**
  1. Upstream: split `handleExecuteAction` into a pure *prepare* step (scope,
     arguments, the built request with secret placeholders) and a *complete*
     step (fold the JSON response, re-render, redact), both exposed by the
     `./host` bundle.
  2. C#: the guarded fetch. Public https only; DNS resolution with
     private-address rejection that re-checks embedded IPv4 in mapped IPv6;
     the connection pinned to the vetted address
     (`SocketsHttpHandler.ConnectCallback`); no redirects, 8 s, 256 KiB, JSON
     only. It needs a test suite mirroring `guarded-fetch.ts`.
  3. `execute_action` (app-only) and `load` descriptors behind an execute
     option, secrets by name through a resolver interface, and a rate limiter.
  4. Image inlining over the render tree, reusing (2).
- **Touches.** `mcp-server` (the host bundle's surface), `dotnet-host`, and
  the action invariants in `CLAUDE.md`: server-side execution, the guarded
  fetch, declared args only, and secrets never displayed. Roughly the size of
  `dotnet-host` again, mostly security-critical C#.
- **Origin.** 2026-10-08 `dotnet-host` design, "Actions later".

### Untriaged

Deferred in archived change designs and never listed until now. Triage each
into a section above, or into *Not adopted*.

- Move the authoring guide into a browser-safe core module, so
  `@widgentic/webmcp` stops carrying a copy (2026-09-03
  `webmcp-authoring-contract`, D1).
- A `focus` chrome token for the designers (2026-08-30
  `designer-brand-chrome`, B8).
- Hoist key-record minting, digest preview and `requireCipher` into shared
  store modules. The memory and Cosmos adapters had already drifted on keyId
  derivation, so check that first (2026-08-31 `self-host-example`).
- A shared write-policy layer over the per-adapter CRUD (same).
- Derive `secretsEnabled` from a store capability accessor instead of a
  host-supplied flag (same).
- Prepare the SQLite statements once (same).
- A package-level store-backed MCP edge helper in place of the copy in
  `examples/docker/mcp.ts`; derive `rejectionStatus` from code families; a
  section factory for the docker client's four list panes (same).

- The preview page for an unknown kind echoes the kind into HTML unescaped
  (`renderWidgetPage`: `Unknown widget kind '<b>bold</b>'`). The kind comes
  from the `ui://widgentic/page/{kind}` URI a host reads. Escape it, and
  regenerate the conformance corpus (found 2026-10-08 during `dotnet-host`).

- The bot's Version Packages PRs never get CI: `release.yml` opens them with
  the workflow token, and PRs opened that way trigger no workflows, so the
  release commit is never verified before it publishes. A GitHub App token
  for `changesets/action` would fix it and remove the bypass the main-branch
  rules otherwise need at every release merge (found 2026-10-07).

## Part 2 · Pairing with other technologies

### AG-UI

#### IOP-1 · Probe AG-UI's MCP Apps middleware — P1, S

- **Problem.** AG-UI is how LangGraph, CrewAI, Google ADK, AWS Strands,
  Microsoft Agent Framework, Pydantic AI, Mastra and the Claude Agent SDK
  reach applications their users own. Whether widgentic already renders there
  is unknown.
- **Direction.** Point CopilotKit's `@ag-ui/mcp-apps-middleware` at a
  widgentic server. Record whether `ui://widgentic/app.html` mounts, whether
  `ui/message` is honoured, and whether `serverTools` and proxied `tools/call`
  exist. Results go to the host matrix and `TESTING.md`. No product code.
- **Origin.** AG-UI comparison, route 1; landscape step 1.

#### IOP-2 · Native renderer for AG-UI applications — P2, M

- **Problem.** An iframe inside an owned application gives up that
  application's theming and in-place patching.
- **Direction.** A thin adapter that reads the `application/vnd.widgentic+json`
  block from a `render_widget` result carried over AG-UI (a
  `TOOL_CALL_RESULT`, or an `ACTIVITY_SNAPSHOT` with its own `activityType`)
  and mounts it with `mountWidget`. http actions need a `tools/call` path
  from the application's backend to the server; prompt actions map to the
  application's composer. Start under `examples/`.
- **Touches.** `examples/`; `@widgentic/core` stays browser-safe and
  dependency-free. A published package is a `[USER]` call (name, release
  group). Depends on IOP-1.
- **Origin.** AG-UI comparison, route 2.

### A2UI

#### IOP-3 · A widgentic A2UI catalog — P2, M

- **Problem.** A2UI's basic catalog has no table and no tree, and widgentic
  has no presence in A2UI's renderers (React, Lit, Angular, Flutter, Lynx)
  or transports (A2A, AG-UI).
- **Direction.** Publish `WgCard`, `WgTable`, `WgTree` and `WgGroup` as an
  A2UI custom catalog: a JSON Schema document with `catalogId`,
  `components`, and `instructions` carrying the `list_widgets` descriptors.
  Props mirror `data`, `hints` and `meta`. The cost is the component
  implementations for at least one A2UI renderer.
- **Touches.** A new artifact; a core subpath or a new package is a `[USER]`
  call. A2UI is at a v1.0 candidate, so pin the target version.
- **Origin.** A2UI comparison, idea 1; landscape step 2.

#### IOP-4 · `toA2UI` projection of the render tree — P2, M

- **Problem.** widgentic cannot act as a generation layer for A2UI
  transports.
- **Direction.** A pure, browser-safe function projecting a built-in render
  (`WidgetNode`) to A2UI basic-catalog components (`Card`, `Column`, `Row`,
  `Text`, `Image`, `List`) plus a `dataModel`. Tables and trees degrade to
  lists unless the IOP-3 catalog is advertised.
- **Touches.** Same placement decision as IOP-3.
- **Origin.** A2UI comparison, idea 2.

### Groundwork for any pairing

Changes to widgentic itself whose main payoff is lining up with other protocols and renderers.

#### ACT-2 · RFC 6902 for the `patch` output mode — P2, M

- **Problem.** The `patch` output mode uses a bespoke path grammar. AG-UI's
  `STATE_DELTA`, A2UI's data-model updates and json-render's stream all use
  JSON Patch (RFC 6902).
- **Direction.** Express `patch` as RFC 6902 operations, keep `merge` and
  `replace` as the defaults, and accept today's form as a legacy shape
  normalized on read. Open question: JSON Pointer paths inside a DSL that
  uses dot paths everywhere else.
- **Touches.** `widget-actions`, `template-widgets`. Stored action bindings
  change shape, so a normalization seam and an old-shape regression test ship
  before any deploy. Lets IOP-2 forward a result as a `STATE_DELTA`.
- **Origin.** AG-UI comparison; landscape step 4; json-render comparison.

#### IOP-5 · Public conformance fixtures — P2, S

- **Problem.** Nobody else can prove a renderer matches widgentic's, and
  IOP-2, IOP-3 and IOP-4 all need that check.
- **Direction.** A versioned fixture set (payload in, `WidgetNode` tree and
  HTML out) generated from the catalog tests and reviewed on change like the
  export snapshots.
- **Touches.** `tools/`, `@widgentic/core` tests.
- **Origin.** A2UI comparison, idea 6; landscape step 7.

### Other output surfaces

#### IOP-6 · Email and image output formats — P3, L (investigate)

- **Problem.** Surfaces that accept neither MCP Apps nor HTML, such as email
  or image-only chat channels, receive text.
- **Direction.** `format: "email"` as an inline-styled HTML document, which
  fits "format selects transport, never content". A server-side PNG only
  through an optional peer or a separate host tool, since a headless browser
  breaks the zero-runtime-dependency rule.
- **Touches.** `mcp-server`, `mcp-widget-output`.
- **Origin.** json-render comparison, idea 5 (its React Email and Satori
  renderers).

### Positioning

#### DOC-1 · Publish the comparison pages — `[USER]`, S

- **Decision needed.** Whether the four hidden pages under `docs/compare/`
  join the public navigation (today they are reachable only by direct URL). They name other projects, and their facts are
  dated 2026-09-10 and need re-checking before publication. The positioning
  sentence they propose: *MCP gives agents tools; AG-UI brings agents into
  your application; A2UI lets an agent compose a screen; widgentic gives tool
  results a designed face any MCP host can show.*
- **Origin.** Landscape step 9.

### Not adopted

Ideas from the comparisons that conflict with a product invariant or the
product's thesis. Re-proposing one needs a spec change that argues past the
reason.

- **Agent-composed layouts**, as in A2UI and json-render. People author
  templates and the agent fills them; that division is what gives fidelity by
  construction and the small wire format. `group` covers composition.
- **Expressions in templates**: json-render's `$computed`, `$math`,
  `$concat`, `$cond`; A2UI's `and`, `or`, `not` and `formatString`
  interpolation. Templates are data; DSL-1 takes the presentational part.
- **Agent-supplied styles or classes**: json-render's free `className` and
  raw `style` props. A2UI removed agent theming in v1.0 for lack of uptake;
  widgentic never allowed it.
- **Edit modes for `render_widget`** (patch the previous render). The server
  keeps no state between calls and claude.ai mounts a fresh iframe per
  render, so there is no previous render to patch. Revisit if a host keeps
  widget instances across calls.
- **Client-side execution of http actions**, as with AG-UI frontend tools.
  The iframe never touches the network.
- **Native mobile renderers** (Flutter, Compose, SwiftUI). Out of scope; IOP-3
  reaches them through A2UI's renderers instead.

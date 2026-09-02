# Design — Designers as WebMCP tools

## Context

See proposal.md — Why. What exists and constrains the approach:

- The designer handles are the whole public surface the package needs:
  `DesignerHandle { getDraft, loadWidget, loadTheme, subscribe, … }`,
  `ThemeDesignerHandle { getTheme, loadTheme, subscribe }`, `SchemaDesignerHandle`,
  `ActionDesignerHandle`. Every `load*` validates and returns `{ ok } | { ok: false,
  errors }` — refuse-at-the-door already exists; the tools relay it. `loadWidget` replaces
  `kind/template/descriptor/load`, keeps the session theme and DROPS `sampleData`, so the
  only public way to change what the preview renders is `descriptor.dataExample`.
- Diagnostics reach a host only through `subscribe(listener)` (fired on every change) or
  the exported pure `deriveDiagnostics(draft, options)`; there is no `getDiagnostics()`.
- WebMCP as specified (webmachinelearning/webmcp, spec IDL): `document.modelContext`
  (`ModelContext : EventTarget`) with `registerTool(tool, { signal, exposedTo })`,
  `getTools()`, `executeTool()`, `toolchange`; tool `{ name, title?, description,
  inputSchema, annotations: { readOnlyHint, untrustedContentHint }, execute(input, {
  signal }) → Promise<any> }`. ChatGPT Desktop documents `document.modelContext`; Chrome's
  origin trial exposes `navigator.modelContext`; Chrome 149+ with
  `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` adds
  `navigator.modelContextTesting.{getTools,executeTool}` for driverless tests. ChatGPT
  registers only top-level-page tools (no iframes) and honors `readOnlyHint`.
- Hosts remount designers (dispose → clear → construct) when switching tabs; a handle
  captured at registration time goes stale within seconds.
- Package rules: browser-safe, zero runtime deps, `exports`-declared entries, boundaries
  test, exports snapshot, pack-check; changesets with a LINKED core/designer/mcp group.

## Goals / Non-Goals

**Goals:** a host adds one call after mounting and a browser agent can read and edit every
designer's working copy with the designer's own validation and diagnostics; the page is
unchanged in browsers without agents; the tool layer is testable with no browser API;
the demo host is deployable as a static site.

**Non-Goals:** a static build of the designer demo (the live URL is the self-host
example); bundling any polyfill; changing `@widgentic/designer` (no new handle methods, no `sampleData`
setter, no element attribute — a beta on a one-day clock must not move the stable
package); a save/persist tool (invariant: people save); the declarative form API (ChatGPT
does not support it); `exposedTo`/cross-origin exposure; a polyfill or in-page agent;
`toolchange` consumption; the authoring guide as a tool (it lives in `@widgentic/mcp`
and imports store limits — porting it is a separate change); the apps-repo adoption.

## Decisions

**D1 — A separate package, not a designer subpath.** `@widgentic/designer/webmcp` was
considered: one fewer manifest and no new edge. Rejected because (a) the designer is the
stable package (0.7.0, in the linked group) and a beta API must be able to break in
minors without dragging it, (b) the WebMCP surface will grow toward the app and the
server (host tools, action execution) and belongs to no single designer, (c) the user
asked for `@widgentic/webmcp`. The package depends on designer for TYPES and on core for
`TOKEN_SPECS`, `validateTheme` and `isPlainObject`; no designer runtime import is needed
today, but the dependency is declared honestly because the handle contract is designer's.

**D2 — Sources are getters, resolved per call.** `exposeDesigners({ widget: () =>
handle | undefined, theme: …, schema: …, action: … })`. Tools are registered ONCE per
page; each call resolves the live handle. A getter may do work — the demo's getter shows
the tab (which mounts the designer) and returns the new handle — so "the agent asked for
the theme designer" surfaces it to the person too. Alternative rejected: registering per
mount and re-registering on remount — every host would have to re-plumb four lifecycles,
and ChatGPT's tool list would flicker on every tab switch.

**D3 — Diagnostics: cache from `subscribe`, derive as fallback.** On first resolution of
a widget handle the package subscribes (a `WeakMap<handle, latest>`) so every `load`/`set`
returns the exact diagnostics the designer computed for that change (the store notifies
synchronously). Before any change has happened the cache is empty; `draft_get` then
returns `deriveDiagnostics(draft)` with no shared-entry context and marks the field
`derived: true` — unknown `dataSchemaRef`/action refs may be over-reported there. Adding
`getDiagnostics()` to the handle is the clean fix and is queued for the designer once the
beta settles (Open Questions).

**D4 — Result shape: MCP text content carrying JSON.** The spec allows `Promise<any>`;
ChatGPT's guidance is "enough to verify the result". `{ content: [{ type: "text", text:
JSON.stringify(payload) }] }` is what every MCP host already parses, so the agent's mental
model from widgentic's own MCP tools carries over, and a structured `{ ok, code, … }`
inside is greppable in transcripts. `structuredContent` is not emitted (not in the WebMCP
IDL). Codes: `NOT_MOUNTED`, `INVALID_INPUT`, `REJECTED`. Nothing throws: a thrown error
becomes a ChatGPT-side "tool failed" with no detail, a result is something the agent can
fix.

**D5 — Names: `<prefix>_<designer>_<noun>_<verb>`, snake_case, default prefix
`widgentic`.** Matches widgentic's MCP tool names (`render_widget`, `list_themes`); the
prefix keeps two widgentic hosts on one origin (or a host's own tools) from colliding.
`title` is set to a short human label — ChatGPT shows it in the "Available site tools"
address-bar list.

**D6 — Example data, not sample data.** The public handle cannot set `sampleData` (D-
Context). `widget_example_data_set` therefore writes `descriptor.dataExample`, which the
preview renders when no sample is set and which IS persisted with the widget — the right
target anyway for an agent proposing realistic data. The description says so.

**D7 — Feature detection order and the "unsupported" result.** `document.modelContext`
(the spec and ChatGPT) first, `navigator.modelContext` (Chrome origin trial) second, an
explicit `modelContext` option beats both (tests, future polyfills). Absent both, the
call resolves `{ supported: false, registered: [], failed: [], dispose() {} }`. Type it
as a minimal `ModelContextLike { registerTool(tool, opts?): Promise<unknown> | unknown;
unregisterTool?(name) }` so the package compiles against no vendor typings and survives
the IDL moving.

**D8 — One `AbortController` per `expose` call, `dispose()` aborts and also calls
`unregisterTool` when present.** Spec: aborting the signal unregisters. Older Chrome
builds pre-date the `signal` option and expose `unregisterTool(name)`; calling both is
idempotent in both worlds. Per-tool `registerTool` rejections are caught and reported by
name; the others proceed (`Promise.allSettled`).

**D9 — Versioning: outside the linked group, 0.1.0, "beta" in description + README.**
Joining the linked group would publish the first version as 0.8.0 alongside packages that
did not change and would forbid breaking the beta API without a group major. Changesets'
`updateInternalDependencies: "patch"` still republishes webmcp with fresh ranges when core
or designer move (the spec's "Webmcp versions alone" scenario). No npm `beta` dist-tag —
`changeset publish` tags everything the same; the wording carries the status.

**D10 — Testing.** (a) Pure: descriptor factories over REAL designers mounted in
happy-dom (the designer test suites already do this) — every spec scenario asserts
content (`kind`, error strings, tokens), never chrome. (b) Registration: a fake
`ModelContextLike` recording calls, rejecting one name on demand, with/without
`unregisterTool`; `document.modelContext` vs `navigator.modelContext` precedence by
defining both on happy-dom globals. (c) Real browser: a `TESTING.md` recipe running
Chrome 149+ with `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` against the demo
(`npm run designer`), listing tools through `navigator.modelContextTesting.getTools()` and
executing `widgentic_widget_draft_load`, plus the ChatGPT Desktop check ("Available site
tools" shows the twelve). Not in the default gate: the flag set is version-dependent.

**D11 — The self-host example is the reference host and the live URL; the demo is the
rig.** The full picture is only visible where a store and an MCP endpoint exist: co-author
in the authoring app (WebMCP), save, and the agent renders the widget over `/mcp` on its
next call. So `examples/docker` registers the tools and is what gets deployed; the designer
demo registers them too (flag-Chrome check, no server) but its static build is cut from
scope. The getter wiring lives once in `examples/shared/webmcp.ts` (`designerSources({
show, current })`: open the section, return the live handle); each example keeps its own
persistence and status line ("agent tools: 12 registered" / "no agent-capable browser").

**D12 — Native shape, no polyfill dependency; the polyfill is a host's choice.**
`@mcp-b/webmcp-polyfill` 5.1.0 (MIT, two deps) installs `document.modelContext` with a
deprecated `navigator` alias, is idempotent and defers to a native context; its tools are
reached through the MCP-B extension runtime (Chromium). Bundling it would break the
zero-runtime-dependency rule and cannot make Firefox or Safari agent-capable — a polyfill
supplies the API, not the agent. The judged surfaces (ChatGPT Desktop, flagged Chrome/Edge)
are native. So the package is duck-typed against the spec shape, resolves whatever the
page has (document → navigator → explicit option), and the README shows the one-line
"load the polyfill first if you want extension agents" recipe. Our pages do not load it.

**D13 — One container app, two containers, one origin.** Azure Files (SMB or NFS) is
rejected for the shared SQLite file: the store opens WAL, which needs shared memory a
network filesystem cannot provide across processes, and two container apps cannot share
ephemeral storage. The challenge instance therefore runs as ONE Container App with two
containers from the same image (`web.ts`, `mcp.ts`) in a single replica (min = max = 1),
sharing an `EmptyDir` volume (same node — WAL-safe) and `localhost`. Container Apps
terminates https for one target port, so `web.ts` gains an OPTIONAL reverse proxy:
`WIDGENTIC_MCP_UPSTREAM=http://localhost:8081` forwards `/mcp` with method, headers, body
and streamed response intact (Streamable HTTP is SSE-shaped; `http.request` piping, no
buffering) and adds no auth — keys still resolve in the MCP service. This is a self-host
feature in its own right (one domain, one certificate), which is why it is specified in
`self-host-example` rather than hidden in infra. Trade-off accepted and stated on the
page: `EmptyDir` is ephemeral — a restart empties the store; the compose file keeps its
named volume and is unchanged in behavior. The deployment itself (Bicep module, RUNBOOK,
ACR build) is apps-repo work, sequenced AFTER the npm release because the image installs
from the registry.

**D14 — Chrome origin trial instead of "enable the flag".** WebMCP is in origin trial in
Chrome 149+ and Edge 150. Registering the deployed origin yields a token that the page
serves as `<meta http-equiv="origin-trial">`, so a judge on plain Chrome gets the tools
without a flag. The token is origin-bound, harmless if leaked, but still configuration:
`web.ts` injects it from `WIDGENTIC_ORIGIN_TRIAL_TOKEN` when set; nothing is committed.
Registration needs a Google account — owner action.

**D15 — Sequence under the deadline (Bogotá, UTC−5; close 2026-09-03 15:00).** Package +
tests + example wiring + docs land in one PR → merge → the release workflow opens the
Version Packages PR → merge → `@widgentic/webmcp@0.1.0` publishes (the image build is the
gate that it resolved) → ACR build + Bicep deploy of the example → real-browser check on
the live URL → widgentic.dev adoption (range bump + one call per mount) and docs page →
the owner records the video and files the Devpost entry. Anything not done by 12:00 on
the 3rd is cut, in reverse order of that list.

## Risks / Trade-offs

- [The IDL is moving: `navigator` vs `document`, `provideContext` in older Chrome] →
  detection order + explicit `modelContext` option + duck-typed interface; the README
  states which browsers were verified and on which date.
- [`draft_get` before any edit returns context-free diagnostics] → flagged `derived:
  true` in the result and in the description; fixed properly by a designer handle method
  later (Open Questions).
- [Twelve tools on one page may crowd ChatGPT's tool picker] → read tools are annotated
  `readOnlyHint` so they run without confirmation; hosts pass only the sources they mount.
- [A prompt-injected page could register look-alike tools] → out of the package's hands;
  the prefix option lets a host namespace, and the browser's per-invocation review is
  the control the platform provides. No secrets ever pass through these tools.
- [The challenge instance is ephemeral (`EmptyDir`)] → single replica, the page says so,
  the video is recorded once; a durable self-host keeps compose's named volume.
- [The `/mcp` proxy must stream] → piped `http.request`, no body buffering, tested with a
  real `initialize` round-trip through the app port in the compose smoke.
- [Publish latency: a fresh publish can 404 on the registry document for minutes] → the
  image build's import smoke is the readiness probe; retry the ACR build, do not pin a
  tarball.
- [Deadline pressure] → scope is the twelve tools, the demo, tests and docs; anything
  beyond is recorded here, not built.

## Migration Plan

Additive. Release `@widgentic/webmcp@0.1.0` through the normal Changesets flow (its own
changeset; core/designer/mcp untouched). Rollback is `npm deprecate` of the beta version;
no consumer is forced to adopt.

**Follow-through after the release — apps repo, in this order (design D13–D15):**

1. `widgentic/apps` infra: a second Container App in the existing environment from the
   example image (ACR build with context `examples`), two containers (`web.ts` with
   `WIDGENTIC_MCP_UPSTREAM=http://localhost:8081`, `mcp.ts`), shared `EmptyDir` at
   `/data`, min = max = 1 replica, https ingress on 8080, KEK as a secret; RUNBOOK
   section + verification-log entry.
2. Live check on the deployed origin: ChatGPT Desktop "Available site tools" lists the
   twelve; draft-load lands in the designer; save; `list_widgets`/`render_widget` over
   `https://<origin>/mcp` with a minted key returns it. Record what was VISIBLE.
3. `[USER]` Chrome origin-trial registration for the deployed origin → token into the
   app's environment; re-check on unflagged Chrome 149+.
4. widgentic.dev: bump to `@widgentic/webmcp ^0.1.0`, one `exposeDesigners` call beside
   the four designer mounts in `apps/web/main.ts`, status line, deploy vNN, verify in
   ChatGPT Desktop.
5. `[USER]` Devpost: repo URL, live URL, ≤3-min narrated YouTube video (co-author → save →
   agent renders), text (use-case fit, UX, human-agent collaboration, implementation),
   submit before 2026-09-03 13:00 PT / 15:00 Bogotá.

## Open Questions

- `[USER]` Register the deployed origin for the Chrome WebMCP origin trial and hand the
  token over as an environment value (D14) — can follow the first deploy.
- `DesignerHandle.getDiagnostics()` in the designer package would remove D3's fallback —
  queue for the next designer change once the beta has been used against real agents.

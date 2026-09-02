# widgentic — public monorepo (`widgentic/widgentic`)

Widgets for agents: turn structured data into agent-friendly widgets (cards,
tables, trees, groups, custom templates) and expose them over MCP with an MCP
Apps UI. This repository is the PUBLIC half of the project: the four npm
packages and the sample hosts. Our own deployments live in the private
repository `widgentic/apps` (local checkout: `/data/source/widgentic-apps`).

## The two repositories and how they connect

| | `widgentic/widgentic` (this repo, public) | `widgentic/apps` (private) |
|---|---|---|
| contents | `packages/core`, `packages/designer`, `packages/webmcp`, `packages/mcp`, `examples/*`, `tools/`, `openspec/` | `apps/mcp-server` (mcp.widgentic.dev), `apps/web` (widgentic.dev), `infra/` (Bicep), Dockerfile, `RUNBOOK.md`, own `openspec/` (`widgentic-app` spec) |
| consumes | nothing from apps — ever | the PUBLISHED `@widgentic/*` packages (`^x.y.z` from npm); never source paths |
| releases | Changesets → "Version Packages" PR → `release.yml` publishes with npm provenance | `az acr build` + Bicep deploy from its own checkout (see its `RUNBOOK.md`) |
| specs | every capability except `widgentic-app` | `widgentic-app` |
| testing docs | `TESTING.md` (package-level) | `RUNBOOK.md` (deploys, production, rig, verification log) |

The protocol between them is deliberately boring: **a change that the apps
need is made HERE, released, then the version range is bumped THERE.** For
iterating before a release use `npm link` from a built checkout of this repo
(recipe in the apps README); `file:` or path dependencies are never committed.

### Working across both with an agent

- One PRIMARY repository per task — the one whose OpenSpec change the work
  belongs to. Start Claude there. Memory, transcripts and `/opsx:*` state are
  keyed to the primary.
- When a task spans both (a production finding that is really a package bug,
  a package change the app must adopt), attach the sibling instead of
  switching: `claude --add-dir /data/source/widgentic-apps` from here, or
  `claude --add-dir /data/source/widgentic` from the apps checkout (`/add-dir`
  mid-session works too). Never make an umbrella folder — it would re-key
  memory and sessions to a third path and both repos' OpenSpec roots stay
  separate anyway.
- Deploys, production checks and the verification log belong to the apps
  repo. Package gates (typecheck, tests, boundaries, pack:check, release)
  belong here. Do not add production facts to this repo's docs — keep only
  generic references.
- The archive routine (sync → archive → commit → push) runs per repository.

## Layout

```
packages/core       @widgentic/core   contract, adapters, mapper, catalog, theming, templates, actions, reactive, shared
packages/designer   @widgentic/designer   widget/theme/schema/action designers, custom elements, src/browser.ts → single-file bundle
packages/webmcp     @widgentic/webmcp   BETA: the designers as WebMCP tools (document.modelContext) — descriptor factory, feature-detected registration, dispose; outside the linked release group
packages/mcp        @widgentic/mcp    output/ (tool-output convention), server/ (handlers, app template, actions, guarded fetch,
                                      server.ts = createWidgenticServer behind ./sdk), authoring/ (./authoring — the hostable write surface),
                                      store/ (./store, ./store/sqlite, ./store/cosmos), secrets/ (./secrets, ./secrets/keyvault)
examples/mcp-server  stdio server with compiled-in widgets (`npm run mcp`); also the test-fixture package @widgentic-examples/mcp-server/widgets
examples/designer    designer demo host (`npm run designer`; /standalone.html uses the published browser bundle)
examples/docker      self-hosted deployment: authoring app + MCP endpoint over one SQLite volume (docker compose)
examples/shared      wiring the example hosts import (designer mount discipline, authoring client, preview-theme merge)
tools/               boundaries.test.ts, exports.test.ts (snapshots of all 19 entries), pack-check.mjs, docs-generate.ts
openspec/            specs/ (current behavior per capability), changes/ (active), changes/archive/ (full history)
```

Every package entry is a subpath in its `package.json` `exports` (types +
default → `dist`). Development never builds: the root `tsconfig` `paths` and
the vitest alias resolve `@widgentic/*` to package SOURCES; `tsx` honors the
same paths. Tests live next to their modules in `__tests__/`; `*.test-d.ts`
type suites run in the default gate.

## Commands

```sh
npm run typecheck      # tsc --noEmit --noUnusedLocals --noUnusedParameters (whole workspace)
npm test               # vitest: projects core / designer / mcp / examples / tools (run one: npx vitest run --project core)
./node_modules/.bin/vitest run <path>   # the rtk shell hook rewrites `npx`; call binaries directly
npm run build          # core → designer (+ browser bundle) → mcp, in that order (dist resolves siblings via workspace links)
npm run pack:check     # dist-only tarballs, publint --strict, are-the-types-wrong (esm-only)
npm run mcp            # stdio example server;  npm run designer → http://localhost:8082
npm run changeset      # every user-visible package change ships with one
openspec validate --strict <change> ; openspec validate --specs
```

Gate before any commit: typecheck, `npm test`, `npm run build`, `npm run
pack:check`, `openspec validate` — all green.

## Boundaries (enforced by `tools/boundaries.test.ts` — do not weaken it)

- Dependency direction: core → nothing; designer → core; webmcp → core, designer; mcp → core; examples →
  packages only. Cross-package imports use the package specifier (root or a
  DECLARED `exports` entry); intra-package imports are relative; no deep paths
  into another package.
- `@widgentic/core`, `@widgentic/designer` and `@widgentic/webmcp` are browser-safe: no `node:`,
  `Buffer`, `process`. `@widgentic/mcp` requires Node ≥ 22.
- Zero runtime dependencies. In mcp the MCP SDK, `@modelcontextprotocol/ext-apps`
  and `zod` are OPTIONAL peers used only by `packages/mcp/src/server/server.ts`
  (the `./sdk` entry); the Azure clients are optional peers used only by
  `./store/cosmos` and `./secrets/keyvault`. The base `@widgentic/mcp` entry
  must stay importable with none of them installed.
- Package tests may import `@widgentic-examples/mcp-server/widgets` and the
  widgentic packages listed in their own manifest's devDependencies (mcp →
  designer for the authoring-guide test); package SOURCES may not.
- `tools/exports.test.ts` snapshots every entry's export names: surface changes
  are a reviewed diff, never accidental.

## Engineering conventions

- TypeScript strict with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`; unused locals/params fail typecheck. Narrow once
  instead of `!`; no `as never`, no `includes(x as T)` (use `.some`); optional
  props written as `...(x === undefined ? {} : { x })`; `errorMessage(error)`
  rather than `(error as Error).message`; `isPlainObject` from
  `packages/core/src/shared/plain-object.ts` (public core export) — `clone` and
  `errorMessage` are copied per package on purpose.
- Comments are short "why" notes. No history, no "observed live…" anecdotes,
  no restating the code; module headers must describe current behavior.
- Every spec scenario has a test; tests assert rendered CONTENT, not just
  chrome classes; CSS guarantees need computed-value tests (text regexes over
  stylesheets have passed through regressions). Bridge behavior is tested
  through the `bootTemplate()` harness in `packages/mcp/src/server/__tests__`.
- Exact-pinned devDependencies; evaluate libraries for inspiration, build
  in-house, name the fallback.
- "Derived, never restated": the authoring guide, tool descriptions and
  designer texts derive from the exported constants (`definitions.ts`,
  `TOKEN_SPECS`, validators); steering lives where agents read it — in tool
  descriptions and descriptors, not in docs.
- Refuse at the door: invalid entries are rejected on write with a structured
  code, re-validated on read and skipped with a diagnostic; built-in kinds and
  `light`/`dark` are reserved; nothing is ever "saved but vanished".
- Forward compatibility: renderers ignore unknown fields; unknown top-level
  payload fields are preserved.
- Any persisted-shape change ships with a normalization seam AND an old-shape
  regression test before it deploys — live Cosmos documents never migrate
  themselves.
- Docs travel with the change: README capability rows/tool lists and a dated
  `TESTING.md` verification-log entry per milestone; design docs are revised
  when reality contradicts them.

## Product invariants (decided; do not undo without a spec change)

- Payload contract `{ kind, data, hints?, meta? }`; `wg-*` classes; `--wg-*`
  tokens (32, each typed and documented in `TOKEN_SPECS`; `x-*` customs);
  `format` selects transport, never content.
- Templates are DATA: no expressions; data SELECTS, the author supplies every
  literal (attr `map`/`prefix`, `fieldFormat`, link prefixes). Denylist tag
  policy (`FORBIDDEN_TAGS`), `on*`/`srcdoc` attributes rejected, URL schemes
  allowlisted, `data:` only on `img src`, node budget bounds interpretation.
- There is NO agent write path: agents learn through tools and draft import
  JSON; people import/save through the designer. API keys are read-only by
  default because they travel into prompt-injectable hosts; `execute` is an
  opt-in scope fixed at key creation.
- Actions: `prompt` proposes (composer prefill, never triggers), `http` runs
  server-side through the guarded fetch (public https, no redirects, 8 s,
  256 KiB, JSON only, declared args only, author-fixed query/headers win);
  the iframe never touches the network; bindings resolve from the store,
  never from the request; secrets are referenced by name, injected only at
  execution, never displayed, always redacted.
- Per-request composition, no caches (cross-tenant leaks); stores validate on
  write and read; anonymous/unknown keys degrade to the built-in catalog,
  never to an error.
- Server assembly lives behind `@widgentic/mcp/sdk`; store and secrets are
  subpaths of `@widgentic/mcp`; two repositories, not five; examples stay here.

## Development loop

1. Spec-first with OpenSpec, driven by the slash commands: `/opsx:propose`
   (planning only) → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`. Each
   iteration is deployed (from the apps repo) as a new `vNN` for live testing.
2. Live findings — from a second agent session, claude.ai, VS Code Copilot,
   Claude Desktop, or the user's screenshots — are routed INTO the in-flight
   change first (delta requirement + regression test), then implemented; a
   deliberate behavior gets a descriptor/doc update; bigger items are queued
   in the change's design risks with rationale. Deviations discovered during
   apply are recorded as design decisions, never absorbed silently.
3. Verification standard: read SERVED bytes (download to a file, then grep —
   piped `curl | grep` is unreliable here), confirm the new revision carries
   traffic, and retest MCP Apps templates in a FRESH conversation (hosts cache
   `ui://` per chat). Reproduce every CRITICAL before reporting it.
4. Commit/push at archive (one commit per change) or when the user says
   "commit and push for now"; short imperative subject, a paragraph of what
   and why. Production must match `main` after every deploy.
5. Closing routine the user expects: everything green → review README /
   TESTING.md for scope → `/opsx:verify` → `/opsx:archive`.

## Release

Changesets with a LINKED group (core, designer, mcp): packages released in
the same run take the same version, but a package with no changeset is NOT
bumped — linked is not `fixed`. `@widgentic/webmcp` (beta) is OUTSIDE the
group: it versions alone from 0.1.0 and rides on its declared ranges. The 0.2.0 release of `designer` left core
and mcp at 0.1.0. Compatibility rides on the DECLARED RANGES, not on matching
numbers: designer and mcp both depend on core, so core can never ship alone;
only the leaves drift. A version-packages commit may touch a manifest without
releasing it (a devDependency range is rewritten in place) — that diff is not
a pending release. Private workspaces are never versioned. `release.yml` on `main`: opens/updates the
"Version Packages" PR; on merge publishes when the repository VARIABLE
`NPM_PUBLISH` is `true` (npm ≥ 11.5, OIDC trusted publishing, provenance);
otherwise it runs `pack:check`. After a publish, bump the range in
`widgentic/apps` and deploy from there.

## Working with the user

- Give the conclusion first; ask only for owner decisions (licensing, names,
  scope cuts, account/settings actions) and mark them `[USER]` with exact
  click paths or commands; make routine calls yourself and record assumptions
  in the artifacts.
- The user reports findings as numbered lists, pasted panel text and
  screenshots and expects each item answered or routed; "the list is only a
  reference" — reorder by value and say why.
- Report honestly what is VISIBLE and verified; never claim "rendered" for a
  text result; never guess host behavior — probe it (a 5-line instrumented
  deploy is cheap and decisive).
- Never print secrets (values, tokens, connection strings, raw keys) in any
  output, log, commit or transcript; values move by file or Key Vault
  reference only.

## Gotchas that cost real time

- Tooling on this VM: the rtk hook rewrites `npx` (use `./node_modules/.bin/…`),
  garbles `grep` output (use `sed -n`/python) and mangles `case … ;;`; quote
  heredocs; `pkill -f` matches the shell's own line — kill explicit PIDs;
  chained `sleep` is blocked (use `until` loops or background jobs); scratch
  files vanish between days — durable recipes live in the repo.
- TypeScript: function declarations lose closure narrowing (arrow consts keep
  it); a type LITERAL stays comparable with `Record<string, unknown>` where an
  interface does not; TS 7 needs explicit `rootDir`; an index signature on an
  all-optional type disables weak-type detection.
- Bridge/template: it is an inline JS string — backticks inside it terminate
  the TS template, and `\uXXXX` needs a double backslash or the served HTML
  carries a raw control byte that kills the script (jsdom won't notice; only a
  real browser rig does). Anchors must never navigate the sandboxed frame
  (capture-phase `ui/open-link`).
- MCP Apps hosts: claude.ai advertises `message` but all three hosts honor
  `ui/message`, so never gate prompt actions on the flag; `serverTools` is the
  reliable gate; app-side `tools/list` is -32601 everywhere; partial tool
  input is size-gated by the host; claude.ai mounts a fresh iframe per render;
  the sandbox CSP blocks external images (hence server-side inlining).
- CSS: an author `display` rule defeats `[hidden]`; `var()` fallbacks fire
  only when the property is UNSET (defining `:root` defaults severed
  `surface → bg`; fallbacks resolve at theme-application time); headless
  Chrome at scale 2 paints `var()` backgrounds wrong — sample pixels at scale 1.
- npm/Node: `net.BlockList` checks IPv4 against mapped-IPv6 rules (a
  `::ffff:0:0/96` rule blocks every IPv4 — embedded addresses are re-checked
  instead); a per-request limiter limits nothing — build it once; `npm pack
  --json -w` returns an object keyed by package; a fresh publish can 404 on the
  registry document for minutes while search lists it; provenance binds
  `repository.url` to the publishing repo.
- OpenSpec: a MODIFIED delta carries ALL original scenarios with their
  ORIGINAL titles (renames read as omissions); after big refactors cross-check
  other requirements in the same spec for stale passages.

## Where to look

- `openspec/specs/<capability>/spec.md` — current behavior; `openspec/changes/archive/` — every change with proposal, design decisions and tasks.
- `TESTING.md` — package testing, protocol smokes, host registration snippets, package-level verification log.
- `packages/*/README.md` — per-package install/usage.
- Backlog (not scheduled): Server-side image inlining substitutes a fetched data URI at EVERY occurrence of its URL (a 200-node tree with one folder icon duplicates the base64 200×) and many distinct small icons exhaust the 24-URL fetch budget ahead of a hero image — an occurrence-aware byte budget and shape-aware priority (flagged in the 2026-09-01 `native-widgets-refresh` review); the reactive/bridge diffs are positional, so a reordering action result re-pairs a visitor's `open` toggles by index — a keyed tree diff would pair by node identity (same review). `execute_action` failure text can name the target hostname (`guarded-fetch.ts` refusal/fetch messages) while `list_actions` deliberately withholds the transport — align the failure texts for execute-scoped keys (flagged in the 2026-09-01 `agent-visible-actions` review). Custom-kind streaming previews (`get_widget_template` app tool); template performance/resource size of `ui://widgentic/app.html`; form inputs / client-side arg collection for actions; DEK unwrap cache; merging two accounts that both already hold content (account LINKING shipped in v41–v43 and aliases a second sign-in onto one account — linking a subject that already owns a populated account is refused with `SUBJECT_IN_USE`; a merge would combine the two).

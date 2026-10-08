# Design — Keyed patching, server previews, budgeted inlining, template size

## Context

See proposal.md — Why. What shapes the approach:

- Two patchers implement one contract. Core `reactive/diff.ts` (`patchNode`) and the
  app template's inline `patch()` both diff the PREVIOUS render tree against the next and
  pair children by index. The template's copy is hand-written JS inside a TypeScript
  template literal, tested through `bootTemplate()` (jsdom), with a real-browser check as
  the only net for parse-level failures.
- `WidgetNode` is `string | { tag, attrs?, children? }`. `renderToHtml`, the catalog DOM
  layer and both patchers read only those fields; unknown fields are ignored everywhere,
  including in templates already cached by hosts.
- The template previews built-in kinds client-side from `tool-input-partial` snapshots
  through hand-written preview builders whose drift is pinned by tests against the real
  renderers. Custom kinds get a skeleton because the frame holds no stored templates.
- `catalog.render` validates the descriptor data schema and recurses through itself for
  `group` items, so a partial payload of a kind with required fields fails, and so does
  any group containing one.
- The inliner collects unique `https` sources from the tree (and HTML surfaces), fetches
  the first 24 in document order, and substitutes each data URI at every occurrence, on
  every projection.
- `buildAppTemplate()` measures 41,038 bytes raw and 11,702 gzipped; 5,216 bytes are
  full-line comments in the bridge and about 2,000 are leading indentation.
- The execute rate limit is an assembly option (`rateLimit: () => boolean`) that each
  edge wires to a per-principal limiter (`examples/docker/mcp.ts` here, the private apps
  server there).
- The template validator ignores unknown fields on `each`, so an `each.key` stored after
  this change stays valid on an older server (it simply patches by position).

## Goals / Non-Goals

**Goals:** identity that follows records through reorders in both patchers with one
shared rule; live previews for stored kinds without growing the frame's attack or drift
surface; inlined results bounded by bytes actually shipped; a template whose size is a
reviewed number.

**Non-Goals:** keyed diffing of mixed or partially keyed lists (React-style); keying
`group` items or card fields; a model-facing note when images stay external; minifying
the bridge with a bundler; changing how built-in kinds preview; any change to `format`
outputs other than which images get inlined.

## Decisions

### D1 — Size budget first, paid for by stripping comments and indentation at build time

`buildAppTemplate()` passes the bridge through a small function that trims each line's
leading whitespace and drops empty lines and lines that are entirely `//` comments. This
is safe by construction: the bridge lives inside a TypeScript template literal, so it can
contain no backtick, so it has no multi-line string; every string is single-line, so no
line's leading whitespace or `//` prefix can belong to a string. Trailing comments stay
(stripping them needs a tokenizer). Expected result: about 33.8 KB before the additions
below, about 37–39 KB after them.

The gate test pins **44 KiB raw (45,056 bytes) and 13 KiB gzipped (13,312 bytes, level
9)** and reports the measured numbers on failure. Mount time is measured once in a real
browser (a 200-row table, a 200-node tree) before and after, and recorded in
`TESTING.md`; it is not gated (timing is noisy in CI).

*Alternatives.* esbuild minification at build time would save more, but the template is
built at runtime from a string and `@widgentic/mcp` has no build-time codegen; adding one
(generated file plus a freshness check) is a separate decision with a debugging cost
(minified code in host devtools). Pruning bridge features was not needed to fit.

### D2 — Keys are a render-tree field, not an attribute

`WidgetElementNode` gains `key?: string`. Output layers never emit it, so
`renderToHtml(tree) === html` keeps holding, the model-facing HTML is unchanged, and
templates cached by hosts ignore it.

*Alternative.* A `data-wg-key` attribute would need no type change, but it changes every
HTML projection, puts record ids into the DOM and the model's text, and collides with the
rule that strips hand-written `data-wg-*` attributes from templates.

### D3 — All-or-nothing keyed pairing per sibling list

A list is reconciled by key only when every child in BOTH the previous and the next list
is an element with a key, and the keys are unique within each list. Then: index the
previous children by key; for each next child, patch the matching previous child's DOM
in place (a changed tag still rebuilds that subtree, as today) or build a new node;
remove previous nodes whose key is gone; then walk the next order and `insertBefore`
only the nodes that are out of place. Any other list keeps today's positional loop
unchanged.

The rule is deliberately simple because it is implemented twice, once in TypeScript and
once in the bridge's hand-written JS. One fixture table (tree sequences covering keyed
reorders, insertions, removals, duplicates, mixed lists and text children) drives both
patchers in a single `@widgentic/mcp` test suite — core's through the public
`mountWidget` with a pass-through fixture kind, the bridge's through `bootTemplate()` —
and asserts the same DOM and the same preserved nodes: the mcp-server scenario "The
template's patcher agrees with the core patcher". The table lives in the mcp tests
because package tests may not import another package's test modules; core keeps its own
scenario tests.

*Alternative.* React-style mixed lists (keyed and positional children together) handle
more shapes, but double the logic in two languages for no current producer: tables, trees
and `each` emit homogeneous lists.

### D4 — Keys come from record `id` and from `each.key`

- `table`: every record is an object with a string or finite-number `id`, distinct as
  strings → each body row gets `String(id)`.
- `tree`: the same rule per sibling list, on the `li.wg-tree-node` elements.
- Templates: `{ each, key, template }` resolves `key` in the item scope; an iteration
  that renders exactly one element gets the key's string form.
- Nothing else is keyed: group items are re-rendered in place (an action folds into one
  item and never reorders the group), and card fields are a fixed set.

`1` and `"1"` collide on purpose and unkey the list, so the string form never maps two
records to one DOM node. Detection of duplicates happens in the patchers (D3); renderers
only skip keys when their own rule fails.

*Alternative.* A `hints.rowKey` naming the identity field is more explicit but adds a
hint to analyze, document and teach for a behavior the reader never sees; `id` is the
dominant convention. An explicit hint can be added later without breaking this.

### D5 — Custom-kind previews render on the server (`preview_widget`), not in the frame

The frame calls an app-only `preview_widget` tool with the latest snapshot and mounts the
returned tree like any preview. Built-in kinds keep their instant client-side previews; a
render that names any non-built-in kind (alone or as a group item) goes to the server for
the whole payload.

Flow control in the frame: at most one request in flight; snapshots that arrive meanwhile
overwrite one pending slot; when a request settles, the pending snapshot (if any) is sent.
The rate is therefore the server round trip, with no timer. A request uses the action
layer's timeout (30 s). Any error, timeout, `RATE_LIMITED`, or missing `serverTools` ends
previews for that render and keeps what is on screen. The tool result clears the pending
slot; later answers are discarded.

The handler composes the caller's catalog like `render_widget`, renders with
`partialData: true` (D6), and returns only `{ tree, css }`: no inlining (no fetches per
snapshot), no diagnostics, no `load`, no payload echo. An unresolvable theme is dropped
rather than failing, because a half-streamed inline token map is normal.

*Alternatives.*
- **App-only `get_widget_template` plus an interpreter in the frame** (the backlog's
  original direction). Rejected. The interpreter — paths, `map`/`prefix`/`format` with
  `Intl`, URL guards, the node budget — is the largest piece of core. Hand-writing it
  into the bridge multiplies the drift the preview builders already carry. Bundling it
  from source needs codegen and adds an estimated 15–25 KB, which breaks D1's budget.
  It would also ship stored templates to the host frame, inline action definitions
  included, against `list_actions`' rule of withholding URLs and headers.
- **Calling `render_widget` from the app.** Rejected: it inlines images (a fetch storm per
  snapshot), enforces the data schema (partial data fails), and is model-visible.

Cost accepted: one round trip and one catalog composition (a store read) per settled
request, bounded by the one-in-flight rule and a per-principal limit.

### D6 — `partialData` is a catalog render option

`catalog.render(payload, { partialData: true })` skips the descriptor data-schema check
for the payload and, through the existing recursion, for every group item. Contract
validation, interpretation bounds and everything else stay. The option threads through
`render` only; renderers do not see it.

*Alternative.* Calling the kind's renderer through `resolve()` from the handler avoids an
API change, but group items re-enter `catalog.render` and would hit the schema check
again.

### D7 — Rate limit: a second gate, same shape as execute

`createWidgenticServer` accepts `previewRateLimit?: () => boolean` beside `rateLimit`;
absent means unlimited (library default, as today). The Docker example wires a separate
per-principal limiter from `WIDGENTIC_PREVIEW_RATE` (default 240 per minute) with the same
`positiveIntFromEnv` fallback. 240 per minute admits a 10-second stream at about 4 calls
a second for several renders a minute; previews never fetch, so the bound protects the
store, not the network.

### D8 — Inlining: priority order, then a byte budget charged per occurrence

1. Collect `img` occurrences from the tree (or the first HTML surface when no tree) with
   their `wg-img-*` shape: `hero` = 3; `thumb`, `avatar` or no shape class = 2; `icon` = 1.
   Unclassed images are template-authored content, closer to thumbs than to decoration.
2. Group by raw URL: occurrence count, best rank, first index. Drop declared resource
   domains as today.
3. Sort by rank descending, then first index. Fetch the first 24 (the existing cap).
4. Admit fetched sources in that order while `dataUri.length × occurrences` fits the
   remaining 3 MiB; skip a source that does not fit and continue.
5. Rewrite every surface from the admitted map, as today. If anything stayed external,
   write one stderr line with counts (`fetch cap`, `byte budget`), never URLs.

3 MiB fits two images at the 1 MiB fetch cap (about 1.37 MB each as base64) and stops a
repeated icon from multiplying. It is counted on one projection because every projection
carries the same substitutions.

*Alternatives.* An images side table (the tree keeps URLs, the bridge substitutes on
mount) would remove duplication entirely, but it breaks `renderToHtml(tree) === html`, and
templates already cached by hosts would show broken images. Revisit as a protocol change
if the budget proves too blunt. A model-facing note was rejected: the model cannot fix
it reliably, and the frame already shows alt text.

### D9 — Designer and guide

The template tree's `each` row gains a compact key input beside its path, with the
completions the editor already computes for the item scope; an emptied input deletes
`key`. The authoring guide's EACH line gains the optional `key`, and the generated docs
regenerate from it.

### D10 — Previews use settled names only (live finding, Claude Desktop probe)

The first probe deploy showed Claude Desktop delivering 114 partial snapshots of an agenda
call without the frame drawing anything, then one `preview_widget` request near the end
that failed `UNKNOWN_KIND`. Claude had written `data` first and `widget` last, so most
snapshots named no widget, and the first snapshot that did carried the name cut
mid-stream. The host side worked: the server logged the frame's `preview_widget` call
before `render_widget`. The frame now treats a name as settled only in the complete
input or once another key follows it in the snapshot (snapshots keep the streamed key
order), for `widget` and for each group item's `kind`. Before that it shows an unnamed
"Generating…" placeholder, leaves unsettled group items out of a server request, and
never lets a still-arriving name select a built-in (`card` may be becoming
`card-deluxe`). `render_widget`'s description now asks agents to write `widget` before
`data`, so streaming hosts can preview from the first rows.

*Alternatives.* Retrying after `UNKNOWN_KIND` until the name stops growing costs a failed
call per streamed fragment and still flashes guessed names. Giving the frame the
catalog's kind names would let it recognize a complete name, but it ships the caller's
kind list to the host for a check the key order already answers.

## Risks / Trade-offs

- [Hosts may not proxy an app `tools/call` while input is still streaming] → Probe
  before building: a short instrumented deploy (apps repository) logs whether a call made
  during `tool-input-partial` resolves on claude.ai, VS Code Copilot Chat, ChatGPT and
  basic-host. Every failure mode degrades to today's skeleton, so the feature is safe to
  ship either way. The host matrix records the outcome.
- [claude.ai size-gates partial input and mounts a fresh iframe per render] → Fewer
  previews there; nothing to fix on our side.
- [Preview traffic loads the store] → One request in flight per frame, the per-principal
  limit, and no fetches in the handler.
- [The two patchers drift] → One fixture table drives both suites (D3).
- [Comment stripping kills the script] → Safe by construction (D1), plus a real-browser
  load of the stripped template in verification, because jsdom does not catch parse-level
  failures.
- [Moving keyed nodes can drop focus or scroll inside a moved row] → Accepted; only
  reorders move nodes.
- [Templates already cached by hosts during a conversation] → They ignore `key`, patch
  by position as today, and never call `preview_widget`. A fresh conversation picks up
  the new template.
- [Image renders change which sources inline] → Only renders over 24 sources or 3 MiB of
  substitutions change, and those were producing multi-megabyte results. Called out in
  the changeset.
- [Tool count grows to nine] → `preview_widget` is app-only like `execute_action`;
  generated docs follow `TOOLS.length`, and the hand-written counts are updated in the
  docs task.

## Migration Plan

Additive. Ship core, designer and mcp together (linked group, minor). `each.key` and
element `key` are optional, so old stored templates and old trees keep working. A
rollback stays safe: older validators ignore unknown fields on `each`, so a template
saved with `key` stays valid and patches by position. After the release, the apps
repository bumps its ranges, wires `previewRateLimit` in its edge, runs the probe and the
live checks, and records them in its verification log.

## Open Questions

- Exact post-change sizes and mount times. They are measured during apply. The budget
  holds unless the additions exceed the estimate, and in that case the number is raised
  in a reviewed diff, which this change permits.

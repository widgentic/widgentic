## Why

Four findings against the render path and the app template have been waiting in
`BACKLOG.md` (Part 1, "Rendering and the app template"). Both patchers pair children
by position, so an action result that REORDERS rows or branches re-pairs a visitor's
open disclosures with the wrong records. Custom kinds stream as a bare skeleton while
built-ins preview live. The image inliner substitutes a data URI at every occurrence
of its URL (one folder icon on 200 tree nodes ships its base64 200 times per
projection) and spends its 24-URL fetch budget in document order, so a run of small
icons can starve a hero image. And the template every Apps host fetches per
conversation has grown to 41,038 bytes (11,702 gzipped) with nothing holding it there.
They land together because they share the same two files, the same harness, and one
budget: the keyed patch and the custom-kind preview both grow the template, so its size
budget comes first.

## What Changes

- **Template size budget (BACKLOG RND-4).** A gate test pins `buildAppTemplate()`'s
  raw and gzipped byte length under explicit budgets; raising one is a reviewed diff.
  Full-line comments in the inline bridge (5,216 bytes today) are stripped when the
  template is built, so maintainer notes stay in source and cost nothing on the wire.
  The baseline and the post-change numbers go to `TESTING.md`.
- **Keyed reconciliation (RND-1).** Render-tree elements MAY carry an optional `key`
  (data only — never serialized to HTML or set on the DOM). When every child in both
  the previous and the next sibling list is a uniquely keyed element, both patchers
  (core `reactive` and the template's inline one) pair children by key and MOVE the
  existing DOM nodes, so identity and a visitor's `open` state follow the record;
  otherwise pairing stays positional, exactly as today. Keys come from: table rows and
  tree nodes whose records carry a unique scalar `id`; and a new optional `key` path on
  the template DSL's `each` (`{ "each": "lines", "key": "sku", "template": … }`). The
  widget designer's tree editor gains the `key` input on `each` rows.
- **Server previews for custom kinds (RND-2).** A new app-only tool, `preview_widget`
  (`_meta.ui.visibility: ["app"]`, hidden from the model like `execute_action`), renders
  a partial payload through the caller's composed catalog and returns its tree and CSS —
  no image inlining, no `load`, no diagnostics, and no data-schema check (partial data
  is incomplete by definition). The template calls it while input streams for any
  render that names a non-built-in kind (alone or inside a `group`), throttled to one
  call in flight with the latest snapshot winning, and patches the result in as a
  preview. Without `serverTools`, on any error, or once rate-limited, the skeleton
  stays. The runnable server rate-limits it per principal. Tool count goes from eight
  to nine.
- **Occurrence-aware image inlining (RND-3).** The inliner orders unique sources by
  shape priority (`hero`, then `thumb`/`avatar`, then `icon`; document order within a
  shape) before applying the 24-URL fetch cap, and admits each fetched source only
  while the bytes it would SUBSTITUTE (data-URI length × its occurrences in the render
  tree) fit a per-render budget; a source that does not fit keeps its URL (alt-text
  fallback) and a smaller later one may still be admitted. Overflow stays silent to the
  model, with a count-only note on stderr.
- `BACKLOG.md` loses the four Rendering entries; README, the docs tool pages and
  `TESTING.md` follow the ninth tool and the new behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reactive-rendering`: in-place patching gains keyed reconciliation with a positional
  fallback.
- `widget-catalog`: the render tree admits an optional element `key`; table rows and
  tree nodes are keyed from a unique record `id`; output layers never emit the key.
- `template-widgets`: `each` accepts an optional `key` path; validation and
  interpretation rules for it.
- `mcp-server`: the app template's keyed patch, server-backed custom-kind previews and
  size budget; the app-only `preview_widget` tool with its rate limit; inlining by
  shape priority under an occurrence-aware byte budget.
- `widget-designer`: the template tree's `each` rows author the `key` path.

## Impact

- **Code.** `packages/core/src/catalog/node.ts`, `widgets/table.ts`, `widgets/tree.ts`;
  `packages/core/src/reactive/diff.ts`; `packages/core/src/templates/` (types, validate,
  compile); `packages/designer` template tree; `packages/mcp/src/server/`
  (`app-template.ts`, `inline-images.ts`, `definitions.ts`, `handlers.ts`, `server.ts`,
  `guide.ts`, rate limiting); `examples/docker/mcp.ts` (edge limiter wiring).
- **Public surface.** `WidgetElementNode` gains an optional field; `TOOLS` gains
  `preview_widget`; new exports are snapshot diffs in `tools/exports.test.ts`.
  Changesets for core, designer and mcp (linked group, minor).
- **Persisted shape.** Stored templates may now carry `each.key`. Old stored templates
  stay valid unchanged; no normalization seam is needed because the field is additive
  and optional.
- **Hosts.** Old cached app templates ignore `key` and keep positional patching; a
  preview call during input streaming depends on the host proxying app `tools/call`
  before the tool result, which is probed before building on it.
- **Cross-repo.** After release, `widgentic/apps` bumps its ranges and wires the
  preview rate limit in its edge; the live verification and the probe deploy belong to
  that repository.

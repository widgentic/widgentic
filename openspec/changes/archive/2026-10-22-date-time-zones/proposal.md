## Why

A template's date format always shows the instant in UTC. That keeps every surface byte-identical, but it is wrong for two common needs:
- an API that returns local times with an offset (`2026-10-21T09:30:00-07:00`) shows `16:30`, not the `09:30` the source meant;
- a person reading a meeting time wants it in their own zone.

The owner reviewed the options (2026-10-21) and chose two additions to UTC, which stays the default:
- **the value's own offset;**
- **the viewer's zone, in MCP Apps frames only.**

An author-fixed IANA zone and a zone token in the pattern were considered and declined.

## What Changes

- **A `zone` field on the date format:** `{ type: "date", pattern, zone?: "utc" | "value" | "viewer" }`, default `"utc"`.
  - **`utc`:** today's behavior, unchanged.
  - **`value`:** the wall-clock time the value itself states. `2026-10-21T09:30:00-07:00` with `HH:mm` renders `09:30`, `…Z` renders in UTC, and an unzoned ISO value renders as written. An epoch number has no offset, so it renders in UTC. This is computed in the renderer, so every surface (tool result, HTML, page, designer, .NET host) agrees byte for byte.
  - **`viewer`:** the viewer's zone, which only the frame knows.
    - **What the renderer does:** it emits the bound text inside a `<time>` element. The element carries the instant (`datetime`, ISO UTC) and the pattern (`data-wg-date`), and its text is the UTC rendering.
    - **What the app template bridge does:** before mounting or patching any tree, it rewrites that text in the viewer's zone. The zone is `hostContext.timeZone` when the host sends a valid IANA zone, else the frame's own default zone, which is the viewer's device zone. A `host-context-changed` that changes the zone re-renders the mounted tree.
    - **Elsewhere:** HTML fragments, `page` documents, the designer's in-page fallback preview and text output have no viewer, so they show the UTC rendering.
  - **Attribute values:** `zone: "viewer"` is refused on an attribute value with `INVALID_TEMPLATE_NODE`, because the frame can only rewrite text. `utc` and `value` work in both positions.
- **Steering is derived.** New core exports:
  - `DATE_ZONES` lists the zones;
  - `DATE_ZONE_RULE` explains them.

  Both guides' `FORMAT` line, the validator's messages and the designer derive from these exports. The designer's date format control gains a zone select, which offers `viewer` on text binds only.
- **App template budget.** The bridge gains about 1 KiB (the walker, a pattern formatter on `Intl.DateTimeFormat`, the host zone). The raw budget rises from 44 KiB to **45 KiB** (46,080 bytes); the gzipped budget stays at 13 KiB. Raising a budget is a reviewed spec change.
- **Release.** Minor releases of core, designer and mcp (a new format field and new exports), a webmcp patch (its guide copy), and then `Widgentic.Mcp` follows the pin.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-widgets`: "Template node forms and interpretation". The date format spec gains `zone`, along with how each zone renders and the attribute refusal.
- `mcp-server`:
  - "App template size budget" rises to 46,080 raw bytes.
  - A new requirement, "The frame shows viewer-zone dates in the viewer's zone", covers the bridge rewrite, the zone source and re-rendering on a zone change.
- `widget-designer`: "Bind rows offer the transforms their position allows". The date format reveals a zone, and viewer is offered on text binds only.

## Impact

- **Core.**
  - `catalog/widgets/value-format.ts`: the `zone` field, the offset-aware parse and `DATE_ZONES`/`DATE_ZONE_RULE`.
  - `templates/compile.ts`: the `<time>` emission for `viewer` on text binds.
  - `templates/validate.ts`: zone values and the attribute refusal.
  - The exports snapshot.
- **MCP.** `server/app-template.ts` (the localizing walker and hostContext `timeZone`), the size test and budget, `server/guide.ts`, the conformance corpus.
- **Designer.** `template-panel.ts`, the zone select.
- **Webmcp.** `guide.ts`.
- **.NET.** No code change: the host bundle and the served template carry the behavior, and `dotnet test` runs over the regenerated corpus.
- **Stored data.** No stored data changes. Existing date formats have no `zone` and keep rendering in UTC. Unknown fields stay forward-compatible: a renderer older than this release ignores `zone` and renders UTC.
- **Docs.** `docs/design/template-dsl.mdx` (the date format) and the generated reference.
- **Hosts.** Which hosts send `hostContext.timeZone` is unknown. Both sources yield the viewer's zone, and a probe during apply records which one each host uses.

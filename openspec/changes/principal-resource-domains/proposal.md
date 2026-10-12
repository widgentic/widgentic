## Why

Images reach an MCP Apps frame only one way today: the server fetches each one and
inlines it as a `data:` URI, because host sandboxes block external images. Inlining is
bounded by design: at most 24 sources and 3 MiB per render, 1 MiB and about 4 seconds per
image. Past those bounds, images show as empty boxes, as in the v82 org tree with seven
blank icons (backlog RND-5). It also fails on sources that refuse server fetches. The MCP
Apps CSP block (`_meta.ui.csp.resourceDomains`) gives a second route: a frame may load
images directly from declared origins. Only the deployment operator can declare them
today (`resourceDomains` on the server assembly), and no deployment does. The person who
knows where their images live, such as their CDN or their CRM's avatar host, has no way
to say so. Principal settings, introduced by `theme-styles-and-defaults`, now give
account-wide preferences a home.

## What Changes

- **A `resourceDomains` settings section.** Each principal may list up to 20 domains
  their frames may load images from directly.
  - Accepted forms are `cdn.example.com`, `*.example.com`, or either with `https://`.
  - The store keeps the canonical origin (`https://cdn.example.com`,
    `https://*.example.com`), deduplicated.
  - Refused with the new code `INVALID_DOMAIN`: other schemes, ports, paths, IP
    literals, single-label hosts and `localhost`, a wildcard anywhere but the leading
    label, and anything that could inject into a host-built CSP (whitespace, `;`, `,`,
    quotes).
  - Refused with `INVALID_SHAPE`: a value that is not a list of strings, or more than
    20 entries.
  - On read, invalid entries are dropped with a diagnostic. A stored record without the
    section reads as no domains.
- **One domain rule, in core.** The parser and its limit are exported from
  `@widgentic/core`. The store, the settings designer, the server assembly and the
  host bundle all use it, so the designer flags exactly what the store refuses. The
  section's checks join the runtime-neutral settings rules (`settings-rules.ts`) that the
  store and the host bundle already share.
- **Declared domains are the principal's plus the operator's.** The transport edge
  composes the principal's list (`composeResourceDomains`) and passes the union with
  the operator's list to `createWidgenticServer({ resourceDomains })`.
  - The app resource declares the union as canonical `https://` origins, on its
    declaration and its read content.
  - Stored widgets and render inputs still cannot extend the list. Only a person,
    through Settings, or the operator can.
  - Operator entries now pass through the same parser. The declaration therefore
    changes from bare hostnames to origins, as the MCP Apps spec writes them.
- **Declared sources are inlined last, not skipped.** This is a behavior change for
  the operator option, which today skips declared hosts.
  - The inliner spends its cap and budget first on sources with no other route, then on
    sources on declared domains.
  - A declared source left external (by overflow, an oversized image or a refused
    fetch) keeps its URL, which hosts that honor the declaration load directly.
  - On hosts that ignore it, or that still serve a stale policy, the outcome is no
    worse than today's. A smoke test on staging (2026-10-12) found claude.ai web,
    ChatGPT and VS Code Copilot all honor the declaration, and all three block
    undeclared images. claude.ai keeps the policy until the page reloads.
  - The overflow note on stderr counts declared sources separately.
- **Settings designer.** A "Resource domains" subsection lists the domains.
  - The person adds, edits and removes entries, and each entry shows its canonical form
    or why it is refused.
  - An invalid entry is kept as typed, so the save's refusal names it.
  - The add control stops at the limit.
  - The text explains the trust that a declaration grants: any render, including
    image addresses an agent supplies, may load from these domains in the viewer's
    browser. Only list domains you control.
- **Self-host example.** The MCP endpoint declares each caller's domains. The Settings
  section shows the new subsection through the designer.
- **Host bundle.** `createWidgenticHost`'s config takes the embedding server's own
  `resourceDomains`, and its `settings` accept the new section.
  - Both lists are read by the same rule.
  - A refused entry is reported in `problems()` and skipped.
  - `resources()` reports the declared list for the app template, in canonical form.
    It is the same list the Node assembly declares.
- **`Widgentic.Mcp`.** Since `dotnet-principal-catalogs` (#30), the .NET host takes a
  settings record at startup and per principal. It now declares resource domains from
  both sources.
  - `WidgenticOptions.ResourceDomains` is followed by the caller's effective
    `resourceDomains` section, combined in Merge or Replace mode as default themes are.
  - The domains are declared on `resources/list` and `resources/read` alike. The
    template content stays global.
  - A refused startup domain stops startup, and a refused principal domain is skipped
    and logged.
  - A failing catalog source falls back to the startup declaration.
  - .NET performs no image inlining, so there a declared domain is the only way an
    external image displays in a host that enforces `img-src`.
- **A host check after the change ships.** The smoke test already answered which
  hosts honor declarations (design D9). After implementation, staging checks the
  per-principal path: domains saved in Settings reach the frame, and a change reaches
  it after the client reloads. The results go in the host matrix.
- **RND-5 is not part of this change.** Its backlog entry is updated with what declared
  domains now cover; design D7 gives the reasoning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-store`: settings gain the `resourceDomains` section. A new requirement covers
  its rule, canonical form, limit, refusal codes, read seam and composition. The
  settings requirement now names two sections.
- `authoring-api`: the settings route maps `INVALID_DOMAIN` to `422`.
- `widget-designer`: the settings designer gains the "Resource domains" subsection.
- `mcp-server`:
  - The Apps declaration declares the union of operator and principal domains as
    canonical origins, and drops invalid entries.
  - Image inlining ranks declared sources last instead of skipping them, and counts
    them separately in the overflow note.
  - The runtime-neutral host bundle takes operator domains and the settings
    section, reports refusals, and gives the declared list in `resources()`.
- `self-host-example`: the MCP endpoint declares each principal's resource domains.
- `dotnet-host`:
  - The app resource's CSP declaration comes from options and settings, at startup
    and per principal (a new requirement).
  - The wiring requirement: canonical origins, refusals stop startup.
  - Per-principal catalogs: the app template's declaration follows the caller, while
    its content stays global.
  - Render-only: declared domains from settings count.

## Impact

- **Code:**
  - `@widgentic/core`: the domain parser and limit.
  - `@widgentic/mcp`: the store (settings, compose, adapters), the authoring status
    mapping, the server assembly, and `inline-images.ts` ranking.
  - `@widgentic/designer`: `settings-designer.ts`.
  - `examples/docker/mcp.ts`.
  - `packages/mcp/src/host` and its conformance corpus (resource-domain cases).
  - `dotnet/src/Widgentic.Mcp`: options, the app resource's list and read, and the
    per-call composition. Plus its tests, sample, README and CHANGELOG.
- **API surface:**
  - New core exports.
  - New store export `composeResourceDomains`, and a new rejection code
    `INVALID_DOMAIN`.
  - `composeThemes` takes an optional pre-read settings promise, so a request reads
    settings once.
  - The `exports.test.ts` snapshot changes.
- **Behavior:**
  - Operator `resourceDomains` are declared as `https://` origins. Their sources are
    inlined when room remains instead of always being skipped. No deployment sets the
    option today.
  - With no domains configured anywhere, every output is byte-identical to today's.
- **Releases:** changesets for core, designer and mcp (minor), plus the
  `Widgentic.Mcp` CHANGELOG. This can ride the 0.11 release that `staging` already
  carries (`theme-styles-and-defaults`, `dotnet-principal-catalogs`, and
  `Widgentic.Mcp` 0.11.0 on the 0.11 pin).
- **Not here:**
  - widgentic.dev adopts this in the apps repository: its edge passes the composed
    domains. It can fold into `adopt-theme-settings` if both ship in one release.
  - RND-5 (fetch waves, a higher cap).

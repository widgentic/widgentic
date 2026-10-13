## Context

See proposal.md for the motivation. The current state:

- **Operator domains.** `createWidgenticServer({ resourceDomains })` lowercases the
  operator's hostnames and declares them verbatim as `_meta.ui.csp.resourceDomains`
  (decision D4 of the 2026-08-22 hardening pass). The inliner then skips every source
  whose hostname is in that set, by exact match. Nothing sets the option:
  - production's `mcpResourceDomains` is `[]`;
  - the self-host example never passes it.

  A spec-form entry (`https://cdn.example.com`) never matches the skip, because the skip
  compares hostnames.
- **Image inlining.** `inline-images.ts` (`resolveSources`):
  - Sources are ranked by shape: hero, then thumb, avatar and template images, then
    icons. Document order breaks ties.
  - At most 24 sources are fetched in parallel, and sources are admitted while they
    fit 3 MiB of substituted bytes.
  - Leftovers keep their URL, and one stderr note reports the counts.
- **Principal settings** (`theme-styles-and-defaults`). One record per principal, made
  of named sections. `applySettingsUpdate` refuses unknown sections on write, and
  `readSettings` drops unknown sections on read. Adapters store the raw record, so a
  later version's section survives an older writer. `composeThemes` reads the settings
  itself, in parallel with the themes. Since `dotnet-principal-catalogs` (#30), the rules
  live in a runtime-neutral `settings-rules.ts`, shared by the store's write path and
  the host bundle. Its `checkSettings` still checks every known section as
  `defaultThemes`, because that is the only one.
- **The .NET host** (`Widgentic.Mcp`, since #30).
  - It takes a settings record at startup, where a refusal stops startup, and per
    principal through `IWidgenticCatalogSource`.
  - Records combine section by section: in Merge the principal's section replaces the
    startup one; in Replace only the principal's record applies.
  - Each call composes the caller's config in a leased V8 runtime.
  - The app template stays global: `WidgenticOptions.ResourceDomains` is declared
    verbatim on its list entry and its read content, both built once.
  - There is no image inlining (NET-1).
- **The MCP Apps spec (2026-01-26).**
  - `resourceDomains` entries are origins (`https://cdn.example.com`,
    `https://*.example.com`).
  - Hosts build the frame CSP by joining the entries into `img-src`, `script-src`,
    `style-src`, `font-src` and `media-src`.
  - The CSP comes from the `resources/read` content's `_meta.ui`. Since April 2026,
    Claude also reads it from the declaration.
- **Host support is uneven.**
  - VS Code fixed resource domains for scripts and styles in January 2026
    (microsoft/vscode#286689).
  - claude.ai's issue (anthropics/claude-ai-mcp#40) is still open:
    - In April an Anthropic engineer said `resourceDomains` "should be working", and a
      reporter confirmed it.
    - In July (Claude iOS) and August (Claude Desktop 1.34493.1), reporters saw
      declared domains not merged into the CSP.
  - The D9 smoke test has since probed three hosts ourselves.

## Goals / Non-Goals

**Goals:**

- A person can name the domains their own frames may load images from, with the same
  validation in the designer, the store, the Node server and the host bundle that
  `Widgentic.Mcp` embeds.
- Declared domains add a second route for images and never take away the first one:
  no host shows fewer images than it does today.
- Real evidence of which hosts honor declared domains, recorded in the host matrix.

**Non-Goals:**

- `connectDomains`, `frameDomains`, `baseUriDomains`. The frame never fetches and never
  nests frames, and claude.ai refuses nested frames by policy.
- Domains per widget or per theme. A declaration covers the whole app resource, so it
  belongs to the principal.
- A public-suffix check: `*.co.uk` is accepted (see Risks).
- Fetch waves or a higher cap (RND-5, see D7).

## Decisions

### D1. One domain rule, exported by core

`@widgentic/core` exports the parser and the limit.

- **Parser:** `parseResourceDomain(input) → { origin, host, wildcard } | { error }`.
- **Limit:** `RESOURCE_DOMAIN_LIMIT = 20`.
- **Users:**
  - the store, on write and on read;
  - the settings designer, for live marks (designer → core only);
  - the server assembly, for the declaration and the inliner match;
  - the host bundle, for the operator list and the settings section it is given (D11).
- **Implementation:** a label-by-label check over ASCII, not `URL`:
  - `URL` accepts ports, userinfo and IDN with runtime-dependent conversion;
  - core must stay neutral for the host bundle.

**Alternative:** a copy of the rule per package, rejected because it drifts. The
"refuse at the door" rule only holds when every door applies the same rule.

### D2. The grammar is narrower than CSP's

Accepted forms are `host`, `*.host`, and either one with `https://`, with an optional
trailing `/`. Case is ignored and surrounding whitespace trimmed. The canonical form is
`https://host`. Each narrowing has a reason:

- **`https` only.** Host frames are https, and http images would be mixed content.
- **No ports or paths.**
  - CSP path matching is ignored after a redirect.
  - Ports are rare for image hosts.
  - The inliner then matches on the hostname alone.
- **No IP literals, single-label hosts or `localhost`.** A declared intranet host would
  let any render make the viewer's browser send GET requests into their network.
- **The wildcard is only the whole leading label, followed by two or more labels.**
  This matches CSP's own semantics: `*.example.com` covers any depth of subdomain but
  not the apex. The two-label minimum refuses `*.com`.
- **No whitespace, `;`, `,` or quotes.** The spec's sample host code joins entries
  into a CSP string, so one of these characters would inject a directive. Refusing
  them guards against hosts that don't sanitize.
- **ASCII only.** A domain with non-ASCII characters is entered in punycode.

Limit: 20 entries. Twenty origins across five directives keep a host-built CSP under
about 4 KB.

### D3. Declared sources are inlined last, not skipped

`resolveSources` gains a leading sort key: undeclared sources come before declared
ones. Shape priority, then document order, still apply within each group. Budget
admission walks the same order. A declared source left external keeps its URL.

**Alternative: skip declared sources (today's operator behavior).** Rejected while
host support is uneven. On a host that ignores declarations, every declared image would
turn from inlined into blocked. A person would opt into that without knowing which host
their readers use.

With inline-last:
- On a host that ignores declarations, a render inlines as many sources as today; only
  the choice of which ones changes, and only when the render overflows.
- On a host that honors declarations, every image shows.

The cost is that a small render on a declared domain still pays the fetch latency and
the payload size. If the probe (D9) shows every target host honors declarations, a
later change can trade that back, for example through a skip mode or through the frame
reading `hostCapabilities.sandbox.csp`. The smoke test showed every probed host honors declarations, so a skip mode is a real option for a follow-up. But a skipped source is blank for as long as a host serves a stale policy.

### D4. The operator list joins the same rule

Operator entries pass through D1, so:
- they are declared as canonical origins;
- the declaration and the inliner match agree, including `https://`-form entries,
  which today never match the skip;
- operator domains also become inline-last.

Invalid operator entries are dropped silently by the assembly, which is built per
request and can't log usefully. Edges that read operator domains from the environment
validate them once at boot with the exported parser and fail to start on a bad entry;
that is the apps repository's task. No deployment sets the option, so changing its
semantics affects no one. The changeset states the change.

### D5. The edge passes one union to one option

`createWidgenticServer` keeps a single `resourceDomains` option. The edge passes
`[...operator, ...principal]`, and the assembly parses and deduplicates the list.

**Alternative:** a separate `principalResourceDomains` option, rejected because the
assembly would treat both lists identically. Which lists to combine is the edge's trust
decision, made where the key is resolved, like catalog composition.

### D6. Settings are read once per request

- A new `readPrincipalSettings(store, id)` never throws. It returns the settings and
  a failure diagnostic.
- `composeThemes` and the new `composeResourceDomains` each accept that promise as
  `options.settings`, so the edge starts one read alongside the catalog and theme
  reads.
- Each function still reads by itself when it isn't given one, so existing callers
  keep working.

**Alternative:** fold the domains into `composeThemes`'s result, rejected because it
mixes two unrelated outputs in one function.

### D7. RND-5 stays out of this change

RND-5 raises the cap through fetch waves within an overall deadline. It is not folded
in here, for four reasons:

1. **The population is different.** RND-5 helps arbitrary hosts that agents supply.
   This change helps hosts a person can name. Declared sources already sit outside the
   undeclared sources' share of the cap, so the v82 org tree case is fixed by a single
   declaration on any host that honors it.
2. **The probe sets RND-5's priority.**
   - If the main hosts honor declarations, RND-5 is left with only agent-supplied
     hosts and stays P3.
   - If they don't, declared domains relieve nothing there, and RND-5 rises.
3. **The risks differ.** This change's risk is the settings and CSP surface, which is
   easy to verify. RND-5's risk is render latency, which needs its own measurement
   (the wave deadline).
4. **No rework either way.** Both touch `resolveSources`, but on different axes: this
   change adds a sort key, and RND-5 changes how fetches are scheduled.

The backlog entry is updated with this split.

### D8. The settings designer subsection

- **The editor:** one row per domain (an input and a remove button) and an add input.
- **Each row shows** the canonical origin or the rule's reason.
- **What the record holds:**
  - a valid entry in canonical form, so what the person saves is what the store
    keeps;
  - an invalid entry as typed, so the store's `INVALID_DOMAIN` refusal names exactly
    what the person sees.
- **When `resourceDomains` is present in `getSettings()`:** only when the supplied
  record had it or the person edited the list. `defaultThemes` is always present, but
  making `resourceDomains` always present too would change every existing settings
  payload and change event. Presence on edit is enough to clear an emptied list.
- **The explanatory text is derived** from `RESOURCE_DOMAIN_LIMIT` and the rule's
  accepted forms.

### D9. The host probe on staging

After the change is deployed to staging (demo.widgentic.dev):

1. Through Settings, declare a domain that serves many distinct images without
   redirects, for example `avatars.githubusercontent.com`.
2. Check the served bytes: `resources/read` with the deployment key carries the
   origin, and a read without a key does not.
3. Render 30 distinct images from that domain, plus one undeclared hero. Do this in a
   fresh conversation on each host: claude.ai web, Claude Desktop, ChatGPT and VS Code
   Copilot.
4. Count the images visible: 24 means inlined only, 31 means the declaration was
   honored.
5. Remove the domain, then check whether a new conversation picks up the change, and
   whether an existing one does.

Results go in the host matrix and the TESTING.md log, and set RND-5's priority.

**Pre-implementation smoke test (2026-10-12).** Staging ran a local probe image,
`principal-resource-domains-probe-c07d459`, on revision `--0000020`. It used
today's skip semantics and declared, for every caller, `https://api.dicebear.com`
(an exact origin) and `https://*.pravatar.cc` (a wildcard). `picsum.photos` stayed
undeclared as the inlined control. Probe 4 is the negative control: 30 undeclared
sources, so rows 25–30 stay external. Blank rows mean the host enforces `img-src`;
visible rows mean it doesn't.

| Host | Control (picsum, inlined) | Exact origin (DiceBear) | Wildcard (pravatar) | 30 declared faces | Negative control (rows 25–30) |
|---|---|---|---|---|---|
| VS Code Copilot | shown | shown | shown | all 30 | enforced: Probe 4 showed rows 1–24 and left 25–30 blank |
| claude.ai web | shown | shown after a reload | shown after a reload | all shown after a reload | enforced: Probe 4 showed rows 1–24 and left 25–30 blank. Before the reload, the console showed `img-src 'self' data: blob: <URL>` and both declared domains were blocked |
| Claude Desktop | not run separately | | | | |
| ChatGPT (desktop) | shown | shown | shown | all shown (rows 1–13 in the screenshot) | enforced: Probe 4 showed rows 1–24 and left 25–30 blank |

**Findings.**

- claude.ai web, VS Code Copilot and ChatGPT desktop all honor declared origins, exact and wildcard.
- Declared images get past the 24-source cap on all three.
- claude.ai keeps the app resource's policy for the rest of the page session. After the deploy changed the declaration, a new conversation in the same browser tab still enforced the old policy; a page reload followed by a new conversation picked up the new one.

claude.ai's effective frame header (from a request after the reload) copies both entries verbatim, wildcard and `https://` origin included. It puts them into `script-src`, `style-src`, `img-src`, `font-src`, `media-src` and also `worker-src`, which goes beyond the spec's mapping, next to `https://assets.claude.ai`. `connect-src` keeps only `'self'`, the sandbox's own `*.claudemcpcontent.com` origin, `blob:` and `data:`. `frame-src` is `blob: data:`, and the header adds `upgrade-insecure-requests`. The canonical form of D2 is therefore exactly what claude.ai consumes. The script-source widening the Risks section names is real there, which is why the designer text tells people to list only domains they control.

So a settings change reaches claude.ai only once the client reloads. That supports D3, which keeps inlining as the first route: during the stale period, declared sources are still inlined while room remains. RND-5 stays P3 (D7).

### D10. The settings rules check each section by its own rule

`settings-rules.ts` gains `checkResourceDomains(value) → { resourceDomains, problems }`,
built on the core parser, and `checkSettings` dispatches per section instead of treating
every known section as `defaultThemes`. The same pattern holds on both paths:
- The store's write path throws the first problem, as it does today.
- The host bundle keeps what passes and reports the rest.

`readSettings` keeps the valid entries and reports each dropped one.

**Alternative:** a separate domains module beside the settings rules, rejected because
the bundle and the store would then each need to know which section uses which check.

### D11. The host bundle reports the declared list

- `createWidgenticHost`'s config gains `resourceDomains`: the embedding server's
  operator list, the counterpart of `createWidgenticServer({ resourceDomains })`.
- Its `settings` may carry the new section.
- `resources()` reports the app template's `resourceDomains`: operator entries first,
  then the settings section, canonical and deduplicated. The key is absent when the
  list is empty, so the corpus output for configs without domains is unchanged.
- Refused entries are listed in `problems()`: under section `resourceDomains` for
  operator entries, and under `settings` for the settings section. A refused settings
  entry is named `resourceDomains.<entry>`, after the `defaultThemes.<mode>` pattern, so
  `Widgentic.Mcp` attributes it to the right section in Merge (decided during apply).

This keeps the C# side to declaring what the bundle reports, with no port of the rule.
The Node assembly and the bundle share the parser, and the conformance corpus pins
their lists to each other.

**Alternative:** a dedicated bundle function that parses a list, with the C# side merging
the lists itself. Rejected because the merge order and the deduplication would then
live in two languages.

### D12. `Widgentic.Mcp` declares per caller

- **Without a catalog source:** the declaration is built once from the startup host's
  `resources()`, as today. A refused operator domain or startup setting stops startup.
- **With a source**, the app resource's read handler resolves the caller's catalog,
  combines its settings with the startup record (Merge or Replace), and creates a host
  from `{ resourceDomains: <operator>, settings: { resourceDomains: <effective section> } }`
  only. It then reads that host's `resources()`. This is not a full catalog
  composition, since domains depend on no widget or theme.
- **Listing:** a `ListResourcesFilters` entry (`McpRequestFilters`, C# SDK 2.2) replaces
  the app entry's `_meta.ui` in the listed page with the same per-caller value.
- **A refused principal domain** is skipped and logged.
- **A throwing source** falls back to the startup declaration and is logged, so the
  template never fails to list or read.

**Alternative:** declare per caller on the read only, and keep the list declaration
global. Rejected because claude.ai reads `_meta` from the declaration as well as from the
read content, and which one wins when they disagree is untested.

## Risks / Trade-offs

- **[A host ignores declarations]** → D3 keeps today's inlining. The probe records
  which hosts honor them, and the docs tell people.
- **[A host caches the app resource, and its CSP]** → On claude.ai the policy lasts for
  the page session (smoke test, 2026-10-12): a settings change applies only after the
  client reloads. Inline-last covers that stale period. The designer text and the
  docs say "after your chat client reloads", not "in new conversations".
- **[A shared-host declaration lets content others control load in the viewer's
  browser]** → Examples: `*.googleusercontent.com`, `*.s3.amazonaws.com`, or a
  `*.co.uk` that slips past without a public-suffix list. `resourceDomains` also widens
  `script-src`, `style-src`, `font-src` and `media-src`. The frame itself never
  references external scripts or styles:
  - templates deny `script`, `link` and `style`;
  - style values refuse `url(`.

  So the wider sources only matter if an injection already exists. The designer text
  says to list only domains you control, and the docs name the shared-host risk.
- **[A native load exposes the viewer's IP address and user agent to the declared
  host]** → The person opts in for their own frames. This is documented in the trust
  model.
- **[Redirects]** → CSP checks every hop, so a declared domain that redirects to
  another host loads only when the target is declared too. Inlining still covers it
  where room remains. This is documented.
- **[Cross-version writes]** → An older store refuses `resourceDomains` as an unknown
  section. The designer and store ship together in the linked release. An older reader
  ignores the section, and an older writer keeps it, so a rollback loses nothing.
- **[Per-request cost]** → One settings point read, which already happens for default
  themes (D6). In .NET, listing or reading the app resource with a source configured
  creates a domains-only host per request (D12). Hosts list and read the template
  rarely, about once per conversation or page session.
- **[The list filter and pagination]** → The app entry can fall on any page of
  `resources/list`. The filter rewrites it wherever it appears, and a protocol test
  covers a paged listing.
- **[.NET has no inlining]** → In .NET, D3 does not apply: a declared domain is the
  only route for external images, and an undeclared one stays blocked in hosts that
  enforce `img-src`, as it does today (NET-1).

## Migration Plan

The change is additive:
- There is no stored-shape migration, and a record without the section reads as no
  domains.
- Regression tests cover the old shape (no section) and a malformed stored entry.

The rollout:
1. Deploy to staging (the self-host demo) and run the per-principal check (tasks 9.x).
   The D9 smoke test already covered host support.
2. Release in the same 0.11 run that `staging` carries: `theme-styles-and-defaults` and
   `dotnet-principal-catalogs`, with core, designer and mcp as minor releases. Then
   `Widgentic.Mcp` 0.11.0 goes out on the 0.11 pin, by hand, as #30's Migration Plan
   describes.
3. The apps repository adopts both: its edge composes and passes the domains, and
   validates its operator domains at boot.

Rollback is the previous image. Stored sections stay as they are, ignored by the older
reader.

## Open Questions

- Should the app template report the host's approved CSP
  (`hostCapabilities.sandbox.csp`, from `ui/initialize`) back as a render diagnostic?
  The answer would make per-host support visible without a manual probe. It changes
  neither this change's behavior nor its tasks, and can follow the probe.

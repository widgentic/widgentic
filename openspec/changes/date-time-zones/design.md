## Context

See proposal.md for the motivation. Current state:

- **The date format.** `packages/core/src/catalog/widgets/value-format.ts` parses an ISO-8601 string or an epoch number to epoch milliseconds (`toEpochMillis`), reading an unzoned value as UTC. `formatDate` substitutes the tokens `yyyy MM dd HH mm ss` from the UTC fields.
- **Why UTC everywhere.** The module header states the reason: server render, designer preview and in-frame re-render must agree byte for byte, or the patcher sees phantom text changes.
- **The validator.** `templates/validate.ts` `checkFormat` refuses a pattern with a stray letter, so every letter in a stored pattern belongs to a token.
- **The app template bridge.** It mounts every tree through `mountResult` (tool results and action re-renders) or `mountPreviewTree` (previews). Both call `build` or `patch` with the tree and keep it as `mountedTree` for the next patch. `applyHostContext` reads `theme`, `styles.variables` and `safeAreaInsets`; it does not read `timeZone`. The served script is comment-free and holds no backtick. It measures 44,992 of 45,056 raw bytes (64 B left) and 11,774 of 13,312 gzipped.
- **The host context.** The MCP Apps spec (`@modelcontextprotocol/ext-apps` `spec.types.d.ts`) gives it an optional `timeZone` (IANA) and `locale`. Which hosts send it is unknown.
- **The demo seed.** The agenda formats `startsAt`/`endsAt` and the inbox formats `receivedAt` with date patterns. Their example values are unzoned.

## Goals / Non-Goals

**Goals:**
- An author can show the time a value states (`value`), or the viewer's local time (`viewer`), with UTC unchanged as the default.
- Every surface that has no viewer still agrees byte for byte.
- The frame shows exactly what the tool result means: a preview, a result and an action re-render localize alike.

**Non-Goals:**
- An author-fixed IANA zone, or a zone read from data (owner decision, 2026-10-21). The agenda example's `timezone: "America/Bogota"` field stays data.
- A zone token in the pattern, or zone names in output (owner decision).
- Viewer zones outside MCP Apps frames: HTML fragments, `page` documents, text output and the designer's in-page fallback have no viewer.
- Locale-aware date output: tokens stay numeric, and `hostContext.locale` is not read.

## Decisions

### D1. One optional field, `zone: "utc" | "value" | "viewer"`

The field is named for what it selects. `utc` stays the default and may be omitted; the designer omits it. The values are an exported tuple, `DATE_ZONES`, beside `DATE_TOKENS`.

**Rejected:**
- A boolean pair (`keepOffset`, `local`), because it allows four states for three meanings.
- `offset` as the name of the second value: an unzoned value has no offset, yet it still renders "as written".

### D2. `value` is computed by the renderer

The ISO match already captures the zone. `toEpochMillis` grows a sibling that returns the instant together with the stated offset in minutes:
- `Z` is 0 minutes;
- `±HH:MM` and `±HHMM` are read as written;
- an unzoned value is 0 minutes, which renders it as written;
- an epoch number is 0 minutes, which renders it in UTC.

`formatDate` then reads the UTC fields of `instant + offset`. This stays pure and deterministic, so the tool result, HTML, page, designer, host bundle and .NET all agree.

### D3. `viewer` is a marked `time` element with a UTC fallback

On a TEXT bind with `zone: "viewer"`, the compiler emits:

`{ tag: "time", attrs: { datetime: <instant.toISOString()>, "data-wg-date": <pattern> }, children: [<UTC text>] }`

- **Why `time`.** It is the semantic element for a machine-readable instant. `datetime` lets anything downstream (a screen reader, a copy-paste, a later host) read the instant without the pattern.
- **Why `data-wg-date`.** `data-wg-*` is the renderer's reserved vocabulary: authors cannot write it (`RESERVED_ATTR`), so the frame never rewrites an element an author made.
- **Why the UTC text.** It is the honest fallback for every surface without a viewer, and it equals `zone: "utc"`.
- **An unparseable value** renders plain text with no element, so the frame has nothing to rewrite and the data stays visible.

The tree gains an element only where an author opted in. An author's CSS sees a `time` element inside their own node.

### D4. `viewer` on an attribute value is refused at the door

The frame rewrites text nodes, not attributes. If `viewer` were accepted on a `title` or `aria-label`, it would silently render UTC, which is "saved but wrong". `checkFormat` learns its position, and an attribute value with `zone: "viewer"` fails with `INVALID_TEMPLATE_NODE`, naming `format.zone` and the two zones that work there. The designer offers `viewer` on text rows only (D8), so a person never builds one.

### D5. The bridge localizes trees, never the DOM

A function `zoned(tree)` returns a copy of the tree in which every `time` node carrying both `datetime` and `data-wg-date` has its children replaced by the instant formatted in the current zone.

- **Where it runs.** `mountResult` and `mountPreviewTree` keep the raw tree (`rawTree`) and mount `zoned(rawTree)`. The patcher therefore compares localized trees, and no phantom text change can occur.
- **Zone changes.** When `host-context-changed` changes the zone, the bridge re-mounts `zoned(rawTree)` through the same patch, so node identity is kept.

**The formatter** is compact:
- `Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instant)` maps the parts to tokens.
- `yyyy` is padded to four digits.
- The pattern is rewritten with `/yyyy|MM|dd|HH|mm|ss/g`. That is exact, because the validator admits no letter outside a token.
- An instant that does not parse keeps the UTC text.

Written in the bridge's style, it costs about 1 KiB raw.

**Rejected: rewriting the DOM after mounting.** The next patch would compare the raw tree against localized text, rewrite it to UTC, and flicker.

### D6. The zone: the host's if usable, else the frame's own

`zoneOf(ctx)` returns `ctx.timeZone` when it is a non-empty string that `new Intl.DateTimeFormat("en-US", { timeZone })` accepts, and otherwise `undefined`, which means the frame's default zone. Both name the viewer's zone, because the frame runs on the viewer's device; the host value matters only when a person has set a zone in the host that differs from the device.

`applyHostContext` stores the zone, and a change re-renders (D5). A host that sends nothing costs nothing.

The probe in task 1 records, per host, whether `timeZone` arrives and how it compares with the frame's default. It informs the docs and does not change the design.

**Probe results (2026-10-21, staging `date-time-zones-probe-e4d7b28`):**
- **claude.ai:** host `timeZone="America/Bogota"` and `locale="es-419"`. The frame's own zone is also `America/Bogota`, with the clock at GMT-0500, so both sources agree.
- **ChatGPT:** host `timeZone="America/Bogota"` and `locale="en-US"`. The frame's zone is `America/Bogota` (GMT-0500), so both sources agree.
- **VS Code Copilot:** no host `timeZone`, and `locale="en-us"`. The frame's zone is `America/Bogota` (GMT-0500), so the fallback path carries the viewer's zone.

All three frames report the viewer's device zone. The host value is used where it is sent, and the fallback covers Copilot. No host sent a zone that differs from the device.

### D7. The raw budget rises to 45 KiB

The bridge cannot fit about 1 KiB into the 64 B left, and the feature lives only in the frame. The raw budget moves from 45,056 to **46,080** bytes. This is a reviewed edit to the pinned number and the "App template size budget" requirement, as that requirement demands. The gzipped budget (13,312) keeps about 1.5 KiB of headroom and does not move.

**Rejected:** squeezing other bridge code to make room. That would trade readability in unrelated paths for one number.

### D8. Steering derives from two constants

- **`DATE_ZONES`** is the tuple.
- **`DATE_ZONE_RULE`** is one sentence: "zone: utc (default) shows the instant in UTC; value shows the time the value itself states (its own offset; an unzoned value as written); viewer shows the viewer's local time inside MCP Apps frames, falling back to UTC elsewhere, and is for text binds only."

Five things derive from them: both guides' `FORMAT` line, the validator's zone messages, the designer's zone select labels and its title, and the docs. The `FORMAT` line's parenthesis "(an unzoned value is read as UTC and formatted in UTC, so every surface agrees)" is rewritten around the rule. The tests for both guides check for `DATE_ZONE_RULE`.

### D9. The designer: a zone select beside the pattern

The date format reveals a select with:
- **UTC** (default; the spec omits `zone`);
- **The value's offset**;
- **The viewer's zone**, on text rows only.

On an attribute row, a stored `viewer` cannot occur: the validator refuses it on import and the diagnostic shows. The island preview runs the app template, so it shows the designer user's own zone. The in-page fallback preview shows UTC.

## Risks / Trade-offs

- **[A host sends a bogus or unsupported `timeZone`]** → `Intl` refuses it, and the frame's default zone applies.
- **[DST and historic offsets]** → `Intl` resolves them from the IANA database the browser ships, and the bridge does no arithmetic of its own.
- **[A preview and its result differ by zone]** → Both pass through `zoned`, so they cannot.
- **[An author's CSS targets the bind's parent's text]** → Only opted-in binds gain a `time` element, and it is inline.
- **[Older renderers ignore `zone`]** → A template stored with `zone` renders UTC on an engine older than this release (forward compatibility). The apps adoption ships the new engine everywhere at once.
- **[Template budget]** → D7, a reviewed raise.

## Migration Plan

No stored data changes; existing formats keep UTC.
1. **Probe (task 1).** A never-merged branch shows `hostContext.timeZone` and the frame's default zone in the frame. It is staged and checked in claude.ai, ChatGPT and VS Code Copilot, and the results are recorded here.
2. **Apply** on `feature/date-time-zones`.
3. **Demo seed.** The agenda's times use `viewer` and its example values gain an offset. The inbox's `receivedAt` uses `value`.
4. **Staging.** Deploy, then the owner's host check in a fresh chat on each host.
5. **Release.** Merge into `staging`, then release 0.15.0 (core, designer and mcp minor, webmcp patch) with the widget-theme change if it is ready. `Widgentic.Mcp` follows the pin, and the apps adoption follows.

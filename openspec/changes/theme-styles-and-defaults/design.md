## Context

See proposal.md for the motivation. What shapes the approach:

- **Themes.** A theme is a registry entry `{ name, label?, description?, tokens }`, complete
  as registered (D20 removed `extends`). `composeThemes` builds a fresh registry per
  request from the built-ins plus the principal's stored themes.
- **Widget styles.** Widget styles are `Record<selector, Record<property, value>>` on the
  descriptor:
  - `widgetStylesToCss` drops unsafe entries at emission, and the store does not refuse
    them.
  - The widget designer audits them (`auditStyles`) and edits them with
    `createStylesEditor` (Tree and JSON tabs, wired in `panels.ts`).
- **Renders that name no theme.** The server emits no theme CSS, and the app template
  supplies the look:
  - **Base:** the base stylesheet.
  - **Host bridge:** a `:root` rule mapping host style variables onto eight `--wg-*`
    tokens.
  - **Dark block:** `:root[data-theme="dark"]` with the dark preset's values for the
    unbridged tokens. The template sets `data-theme` from the host context.
  - **Explicit themes** go in the per-render `css` under `:root, :root[data-theme="dark"]`,
    in a later style element, so they win in both modes.
- **The `ui://` template is the same document for everyone**, and hosts cache it per
  conversation. Anything per principal must travel in each result's `css`.
- **Stores keep each entry as its own record:**
  - Cosmos: documents `<kind>:<name>` in the principal's partition, queried by id prefix.
  - SQLite: `entries` rows keyed by `(principal_id, kind, name)`.
  - Files: `<dir>/<principal>/<kind>s/*.json`.
  - There is no per-principal record for anything but identity (profiles, keys).
- **Designers.** The designer package has four designers, each a factory plus an opt-in
  custom element. Hosts own Save, and the authoring surface owns persistence.
- **Branch base.** This branch is based on `staging`, which already carries
  `derived-input-schemas` (tool registration from the exported schemas).

## Goals / Non-Goals

**Goals:**
- One rule set for styles, whether they sit on a widget or a theme: same shape, guards,
  editor and audit.
- A settings record that later preferences join without new store methods, routes or
  adapters.
- Defaults resolved in one place (the registry) and applied identically by every output.
- Zero output change for callers with no default themes and no theme styles, so the host
  bundle's conformance corpus and the .NET host stay byte-identical.

**Non-Goals:**
- A dark mode for `page`/`app` documents (`prefers-color-scheme`); they have none today.
- Import/export for settings, and WebMCP tools for the settings designer: settings are
  saved by the person, and nothing drafts them.
- A `.NET` option for default themes (`WidgenticOptions`); it follows on the NuGet
  package's own cadence.

## Decisions

### D1 — One settings record per principal, made of named sections

Each principal has one record, `{ defaultThemes?: { light?, dark? } }` today.

Why not flags on theme entries:
- **Uniqueness by construction.** The section holds one name per mode, so at most one
  theme is a mode's default.
- **Atomic writes.** Changing a default is one write in every adapter.
- **Later settings need no new plumbing.** They join as sections, not as new ports.
- **The flag alternative was rejected:** a `default` flag on each entry, with `putTheme`
  clearing it from the others, means several Cosmos writes, and concurrent saves could
  leave two defaults.

Write semantics: `putSettings(update)` replaces the sections present, removes a section
given as `null`, and keeps the rest.
- **Why section-level:** an older client that knows only `defaultThemes` can never erase a
  section a newer server added. A whole-record replace would.
- **Within a section, replace:** `{ light: "b" }` unsets `dark`.

Validation:
- **On write:** an unknown section name is refused (`INVALID_SHAPE`), so nothing is "saved
  but vanished".
- **On read:** an unknown section is ignored, so data written by a later version still
  loads.

Storage per adapter:
- **Memory:** a map.
- **File:** `<dir>/<principal>/settings.json`.
- **SQLite:** an `entries` row with kind `settings` and name `principal`, which needs no
  schema migration. Entry listings and limits filter by their own kinds.
- **Cosmos:** a document `settings` in the principal's partition. Its id lies outside
  every `<kind>:` prefix the entry queries match.
- **Review: Cosmos must not rely on read-then-write.** Both reviews found that Cosmos
  checked and wrote in separate steps, so a race could leave a default naming a deleted
  theme. All of a principal's documents share its partition, so:
  - **`putSettings`** commits in one transactional batch. It replaces the settings
    document with `ifMatch` on the etag it read (or creates it) and reads every named
    theme; a missing theme fails the batch.
  - **`removeTheme`** deletes the theme in a batch that replaces the settings document
    unchanged, with `ifMatch`. When none exists it creates an empty one, which reads as
    no settings.
  - **On conflict**, both retry up to three times.
  - **An emptied record** is kept as an empty document, because a batch Delete cannot be
    made conditional.
  - **Fallback:** a client without `batch` keeps the earlier path.

### D2 — The registry carries the defaults

`createThemeRegistry()` gains `setDefault(mode, name)`, `getDefault(mode)` and
`defaults()`, which start as the built-ins, and `composeThemes` applies
`settings.defaultThemes`.
- **No new plumbing.** Handlers, the server assembly, `preview_widget` and the host bundle
  already receive a registry, so none of their signatures change.
- **Byte-identical without defaults.** The emitters treat a built-in default as "emit
  nothing", so output is unchanged when nothing is set.
- **Alternative rejected:** a separate defaults option threaded through every consumer.

### D3 — Mode scoping by selector, styles scoped with `:where()`

Light-mode declarations go under `:root:not([data-theme="dark"])` and dark-mode ones
under `:root[data-theme="dark"]`:
- **Light stays out of dark mode.** The `:not()` keeps a light default's tokens out of
  dark mode wherever the dark side sets nothing.
- **Both beat the template's static rules.** Both selectors weigh (0,2,0), which beats the
  static `:root` bridge. The dark selector ties with the static dark block, and the later
  style element wins.

Theme styles are scoped as `:where(<mode selector>) <part>` on every top-level part,
inside `themeStylesToCss` (core) with the widget generator's guards. A scoped rule weighs
exactly what its author wrote. A theme that is the default for both modes is emitted
unscoped, exactly as an explicit theme is.
- **Review: styles are scoped only when both defaults carry styles.** A default's
  classes are layout a widget relies on: scoped to the light mode, they would vanish on
  a dark host whose default has none to replace them, whether that default is the
  built-in or a theme without styles. Unscoped, they read the active mode's tokens.
  Tokens stay mode-scoped always.
- **Review: top-level parts, root-anchored parts.** Splitting on every comma broke
  `.wg-row:has(.wg-ok, .wg-warn)`. A part anchored at the root (`:root[…] .wg-x`,
  `html .wg-x`) takes `:where(<scope>)` on its root compound, because prefixing would
  demand a root inside the root and never match.

*Alternative rejected:* `@media (prefers-color-scheme: dark)`. It follows the OS, not the
host; the template already mirrors the host in `data-theme`.

### D4 — Order: theme styles, then kind styles, then token declarations

A theme defines shared classes and a widget refines them, so a widget's own rule wins a
tie of equal weight. Token declarations only set custom properties, so their position
doesn't matter; they stay last, where explicit themes already put them.

### D5 — Theme styles follow widget styles: refuse bad shape, drop unsafe entries

- **Bad shape is refused.** The store refuses a `styles` value that is not a map of maps
  of strings (`INVALID_THEME`), and the registry throws on a bad shape, so out-of-band
  data is skipped at composition.
- **Unsafe entries are kept.** Entries the guards would drop are stored and dropped at
  emission; the designer's audit flags them.
- **Alternative rejected:** refusing unsafe entries on write, which would make theme
  styles stricter than widget styles for no gain.
- **Review: the shared guards had gaps.** Theme styles reach every render under a
  default, so the gaps widget styles already had now mattered more:
  - **A comment** in a selector or value could rewrite the selector or swallow the rest
    of the sheet.
  - **`image-set()` and `src()`** carry URLs without spelling `url(`.
  - **The `.wg-` test** only checked that a part contained `.wg-`, so `body:not(.wg-x)`
    passed.

  The guard now bans comment markers and those functions, in style values and token
  values alike. A selector part must name a `.wg-` class outside every pseudo-class
  argument and attribute test, and must not open with a combinator. Both guides teach
  this from one rules object built from the exported constants.
- **Apply note: one shape predicate.** The registry, the store's write check and the
  theme designer's import all need the same "map of maps of strings" test. Rather than
  three copies, `@widgentic/core` exports `isStyleMap` from `./catalog`, beside
  `widgetStylesToCss`. It is a public export the specs don't list, reviewed through the
  `tools/exports.test.ts` snapshot.

### D6 — A theme named in settings cannot be removed

`removeTheme` answers `THEME_IN_USE` while `defaultThemes` names it, like the other
`*_IN_USE` refusals.
- **Rename:** the host saves the new name, updates Settings, then deletes the old name.
- **Alternative rejected:** clearing the setting on delete, a silent side effect.

### D7 — The settings designer is the fifth designer

`createSettingsDesigner` / `defineSettingsDesignerElement` follow the other four (handle,
`readOnly`, `subscribe`, `widgentic-change`, `dispose`, chrome options).
- **Default themes subsection.** One select per mode: the built-in, then the host-supplied
  theme entries. The host saves through `PUT /settings`.
- **Missing themes stay visible.** A record naming a theme the host did not supply shows
  as "unavailable" rather than being dropped.
- **Unedited sections pass through untouched.**
- **No theme-designer marks.** The theme designer carries no default marks: one place
  decides defaults, and a select per mode makes "only one per mode" visible.

### D8 — Documents use the light default

`page` and `app` documents never receive a host theme. They take the light default's
tokens at `:root` and its styles unscoped, and ignore the dark default.

### D9 — Agents read styles and effective defaults, never settings

- **`list_themes`:** lists each theme's `styles` (so a drafted widget can use `.wg-btn`)
  and `defaults` with the effective names.
- **Guides:** `get_authoring_guide` and the WebMCP guide copy describe `styles` from the
  same `UNSAFE` / `PROPERTY_NAME` constants.
- **WebMCP:** `<prefix>_theme_load` passes `styles` through the designer's validation.
  There is no settings tool.

### D10 — The host bundle and .NET stay untouched in API

The bundle composes a registry from config themes, with no settings, so its output
changes only when a configured theme has styles. The conformance corpus gains one render
under a styled theme. `npm run conformance:generate` and `dotnet test` run in the gate.

### D11 — widgentic.dev adopts through the release, in a companion change

Per the cross-repository protocol:
1. This change releases the packages.
2. The apps repository then opens its own change, a `widgentic-app` delta: a Settings
   section in `apps/web` mounting the settings designer against the mounted authoring
   surface (`/api/settings`), the Themes list showing defaults, and `THEME_IN_USE`
   surfaced through the existing feedback banner.
3. The apps change is deployed as the next `vNN`.

That change is `adopt-theme-settings` in widgentic/apps. It carries its own tasks (the
release bump, the Settings section, the pre-deploy scan and the deploy), so this change
completes without them.

Before the release, the same UI is exercised in the self-host example, which shares the
designer package and the authoring surface.

### D12 — The widget designer opens on a host-chosen preview theme

`createDesigner` takes `previewTheme`: the name of one of the `themes` it was given. It
opens with that entry selected, tokens and styles, and ignores a name it was not given.
The designer stays unaware of settings; the host decides which name to pass.
- **The apps pass the light default.** That matches documents (D8) and is one line per
  app. Following the app's colour scheme instead is the host's choice later, with no
  package change.
- **Why an option, not `loadTheme`.** `loadTheme(tokens)` sets only tokens, so a theme
  with styles would preview half-applied.
- **Apply note: loading keeps the whole preview theme.** `loadWidget` already kept the
  preview theme's tokens across a load, but dropped `themeStyles`, which this change
  added. It now keeps both.
- **Returning to Widgets resets the preview theme to the default.** The example reopens
  the widget designer on tab return to pick up newly saved themes. A preview theme
  picked by hand is not part of the draft the example carries over, so it resets (to
  "none" before this change). Accepted.

### D13 — Review fixes that keep every surface on the same theme

These are from the two reviews of PR #29:
- **Named themes in action re-renders.** A named theme that carries styles rides the
  payload by name (`themeName`), so an `execute_action` re-render resolves the same
  entry, styles included, instead of a bare token map. Themes without styles leave the
  payload exactly as before.
- **Widget pages.** The `ui://widgentic/page/{kind}` page takes the light default, as
  documents do.
- **Streaming previews.** A theme name still streaming previews with no theme, not the
  defaults, so the look never flips mid-stream.
- **Example app, unread settings.** When the settings cannot be read, Settings opens
  read-only with no Save, so an empty record never replaces the stored one.
- **Settings element.** The settings designer gains `setThemes`, and its element a
  `themes` property, so a page using only the element can offer choices.

### D14 — The designers check at the door what the store checks at Save

An agent driving the WebMCP tools found that `draft_load`, `definition_check` and
`theme_load` accepted a built-in kind (`table`), a built-in theme name (`light`) and
names with spaces. All of them failed only when the person saved. These checks now run
in the designers' import:
- The identifier pattern moves to core as `SAFE_IDENTIFIER`, so the designer, the
  store and the guides share one rule.
- The reserved sets come from the catalog's kinds and the built-in registry's themes,
  not from a list.

A missing `dataShape` is different. The store accepts it, so the designers warn
instead of refusing, and the guides now call it "strongly recommended" rather than
"REQUIRED", which the store never enforced.

The preview selector matched entries by content, so an empty token map picked "Light".
The agent's retest showed the deeper problem: `widget_theme_set` replaced the theme the
person had chosen. The choice is now the draft's `previewTheme` (preview-only, like
`themeStyles`). Only the person's pick in the selector changes it, and `loadTheme`
layers tokens over the chosen entry: its styles stay, and `{}` returns to it exactly.
This also settles the review finding about stale styles beside "none" (D13): the
selector now always names the entry whose styles the preview carries.

### D15 — Schema keywords the validator ignores are warnings, not refusals

The same agent loaded a schema with `type: "banana"`. The store accepts it on purpose:
`checkStoredSchema` is shallow, and the validator ignores what it cannot use, so a
stricter store would refuse what the renderer tolerates and could hide stored entries
on read. So core gains `auditDataSchema`, which names what the validator would ignore:
- an unknown `type` name;
- a `pattern` it will not run;
- an `enum`, `required`, `properties` or `items` of the wrong shape.

The schema designer and the widget designer show these as warnings, `schema_load`
returns them, and `definition_check` reports them for an inline schema. Unknown
keywords stay silent, because they are forward compatible. The guides now derive the
supported type list from `DATA_SCHEMA_TYPES`. Refusing such schemas at write would be a
store change of its own, with read-side leniency for documents already stored, so it
is not part of this change.

### D16 — Second review round: the guards read CSS as CSS

The two re-reviews of `6c7eace` found that the stricter guards had holes and side
effects:
- **One scanner.** Depth counting ignored quoted strings, so `.wg-a[title="("], body`
  hid a comma and `body:not([title=")"] .wg-x)` closed `:not(` early. One quote-aware
  scanner in core (`shared/css-scan.ts`) now serves the comma split, the top-level text
  and the root-compound scoping.
- **Balance.** An unclosed bracket or string in a selector, a style value or a token
  value runs on through the rest of the stylesheet, so all three must balance. Token
  values also refuse `\`, whose escapes spell any banned call.
- **Selectors held through `:is()`/`:where()`.** The previous round's "`.wg-` outside
  every argument" rule dropped legitimate rules such as `:is(.wg-btn, .wg-link):hover`
  and `:where(.wg-card) h3`. A compound now counts when it names a `.wg-` class itself
  or through `:is()`/`:where()` whose every argument does. `:not()`, `:has()`,
  attribute tests and strings still never count.
- **Rules as text.** `STYLE_RULES` and `TOKEN_VALUE_RULE` move to core, built from the
  constants, so both guides, the WebMCP descriptions and the designers' messages read
  one copy.
- **Stored data.** Stricter token rules would have made a theme stored under 0.10
  vanish entirely. `normalizeStoredTheme` now drops only the refused token on read,
  with a diagnostic (Migration Plan).
- **Cosmos.** `@azure/cosmos` rethrows batch failures without a status code, so a
  permission refusal is recognized from the wrapped message. `putSettings` checks only
  the defaults its update writes, as the other adapters do.
- **Identity checks.** They apply only when a load changes the kind or name, so
  `widget_example_data_set` and `theme_tokens_set` are not refused for an identity the
  person typed. The widget designer flags a malformed kind as it is typed, and the
  designer demo restores an autosaved draft as the person left it.
- **Example app.** A Settings visit after a failed read opens the stored record, not the
  read-only placeholder.
- **Settings element.** It adopts a `themes` property set before the element was defined.

### D17 — Third review round: fix the normal flow, record the edge cases

The re-reviews of `5969a8b` were triaged against normal use: importing, exporting and
editing in the designers, and agents driving them.

Fixed:
- **Newlines in strings.** As in CSS, a newline now ends a string unclosed, so a string
  broken across lines fails the balance check in selectors, style values and token
  values. One such entry could otherwise erase every rule after it.
- **Bounded nesting.** `:is()`/`:where()` nest at most 16 levels, so the generator,
  which runs on every render, can never overflow the stack.
- **Self-host remount.** The example remounts the widget designer with the draft as
  `initialWidget`, so a draft whose kind Save would refuse survives a tab switch,
  including the switches the WebMCP tools trigger. The apps change takes the same fix.
- **Cosmos.** A permission refusal is recognized only from its phrases or an explicit
  `StatusCode: 403`; a bare "403" also appears in throttling diagnostics. Other batch
  failures are logged with their first line.
- **Steering.** `list_theme_tokens` reads `TOKEN_VALUE_RULE`.

Kept as is:
- **A kind problem freezes the preview,** with the problem in the banner. The
  `widget-designer` spec requires that for reserved kinds, and malformed kinds now
  behave the same way.

Accepted, not fixed (outside normal use):
- **Re-saving a theme stored under the old token rules** stores it without the dropped
  token. The scan in the apps change will show whether any such theme exists.
- **A corrupt autosave in the designer demo:** fixed after all (D19). The demo drops a
  saved draft the designer cannot open and starts fresh, so the page and its agent
  tools still load.
- **Mode scoping counts styles that produce no CSS:** a default whose every rule the
  guard drops still scopes the other default's styles.
- **`composeThemeEntries` does not normalize.** Config-supplied themes, as in the .NET
  host, are authored now and are refused loudly rather than trimmed.
- **Sibling combinators** (`.wg-a ~ *`) predate this change; they are `BACKLOG.md` THM-3.

### D18 — Diagnostics come from the designer that holds the shared entries

The browser agent found that `widget_definition_check`, and `widget_draft_get` on a
freshly opened widget, reported every `dataSchemaRef` as unknown, and never checked the
example against the referenced schema. The WebMCP layer derived diagnostics itself,
without the host's schemas: its cache of the designer's diagnostics was empty until the
first change.

The designer handle now answers both questions:
- `getDiagnostics()` returns the current draft's diagnostics.
- `checkWidget(definition)` returns what a load would.

Both resolve against the schemas and actions the host gave the designer, so the tools
report what the person sees. With no designer mounted, the check falls back to the
definition alone, and a reference it cannot verify is no longer called unknown. The
cache is gone.

The same report noted that a descriptor carrying both `dataSchema` and `dataSchemaRef`
loaded with only a diagnostic, while the guide says it is refused and the store does
refuse it. It is now refused at load, like the other things Save refuses (D14).

### D19 — Fourth review round: tool calls never move the person's view

Reviewer 1's re-review of `8841d0a` found one regression and four smaller gaps.
- **The check moved the view (regression).** D18 made `widget_definition_check` read
  the designer through the host's `widget` source. Hosts let that getter show the
  section and remount the designer, so a read-only check switched tabs and reset the
  designer. `DesignerSources` gains `widgetIfMounted`, a getter that never shows or
  mounts anything, and the check reads only that. Without it, the check runs on the
  definition alone.
- **Remounts reset the preview pick.** Both examples remounted the widget designer
  whenever its section was shown, including when an agent's tool call showed the
  section already on screen. They now remount only when the person enters the section,
  and the remount keeps the person's preview pick. Agent tokens layered on top survive
  tool calls; a trip to another tab drops them, which is a person's navigation.
- **"Unknown schema" without schemas.** The designer passed `[]` when the host gave no
  schemas, defeating D18's guard. It now passes the host's value through, and only an
  explicit list makes a reference unknown.
- **A request-level Cosmos code read as an operation result.** A thrown batch's own code,
  read from its message, was copied into every operation's slot, so a 404 for a missing
  container read as "theme already gone". A thrown request now reports no operation's
  outcome; its message classifies a 403 and is logged.
- **Malformed schema fields at the door.** A non-string or malformed `dataSchemaRef` is
  refused at load with `INVALID_SHAPE`, the store's code. A `dataSchema` that is not an
  object is refused because the designer cannot open it (a `null` schema used to break
  every widget tool after loading). The store accepts such a `dataSchema`, so one written
  through the authoring API would still fail to open in a designer; that needs an API
  write and is accepted.
- **Follow-up at `b0f0e74`: a hidden designer's shared entries go stale.** It keeps the
  schemas and actions it was mounted with, so a schema saved in another section read as
  unknown in the check. The examples' `widgetIfMounted` answers only while the Widgets
  section is shown; otherwise the check leaves references unverified.

### D20 — Theme `extends` is removed

The browser agent found a theme with `extends: "no-such-theme"` accepted by
`theme_load`. Tracing it showed the registry merged a base at registration, and the
store accepted the field unchecked. But nothing used it: no designer, seed, guide or tool
set it, and "a theme based on another" on widgentic.dev is a one-time copy
(`seedThemeEntry`). Kept, it would have needed its own guards:
- an unknown or deleted base made a stored theme vanish;
- composition depended on the order themes are read;
- the theme designer previewed without the base.

The owner chose to remove it rather than complete it. An entry is complete as registered,
and a host that derives one theme from another merges the tokens and styles before
registering. An `extends` field is ignored like any unknown field, so no refusal, exclusion
or read seam is needed. The apps change's pre-deploy scan counts stored themes that carry
one, to confirm none relies on it. Removing it in this change means the styles merge
through `extends`, added here, never ships.

### D21 — The app template asks hosts for no border

Owner request, folded into this change. The MCP Apps specification (2026-01-26) lets a UI
resource say whether the host draws a border and background around it
(`_meta.ui.prefersBorder`). It recommends an explicit value, because hosts' defaults differ.

Widgets draw their own surface, so the app template declares `false`. The value lives once,
on the shared `APP_TEMPLATE_RESOURCE` descriptor, which the host bundle's `resources()`
carries to `Widgentic.Mcp`. The Node assembly and the .NET host both put it in `_meta.ui`,
on the resource declaration and on its `resources/read` content, since hosts may read either.
The operator's `csp.resourceDomains` now rides on the read content too.

## Risks / Trade-offs

- **A default theme overrides host-bridged colors** (`bg`, `fg`, …) in its mode, as an
  explicit theme does today. → Documented in the theming docs; that is what choosing a
  default means.
- **Broad theme selectors restyle every widget**, including built-ins (`.wg-card`).
  → Intended. The theme designer previews any kind under the theme.
- **Saving a renamed default takes three steps** (theme, settings, delete).
  → Each step is validated and refusals are shown; the hosts sequence them.
- **Hosts that never report a theme always get the light default.** → Same as built-in
  behavior today.
- **A future partition-wide Cosmos scan would meet the `settings` document.**
  → The contract tests list every kind after settings are written, so a stray read fails
  a test.
- **Custom adapters written against the earlier port have no `settings`.**
  → `composeThemes` keeps the built-in defaults when the method is missing (silently:
  such an adapter has no settings) or its read fails (with a diagnostic), because
  defaults are cosmetic. The changeset says adapters
  now implement `settings` and `putSettings`.
- **The settings designer offers only the themes the host passes.** → Hosts pass the
  stored list; an absent name shows as "unavailable".
- **Apply note: a seeded section comes back once it is fully cleared.** The seed writes a
  settings section only when the principal lacks it, and setting both modes to the
  built-in removes `defaultThemes`. A persistent self-host store with a seed file
  therefore re-applies the seed's defaults on the next restart. Changing one mode
  survives restarts. → Accepted for a demo convenience: staging's store is empty on
  every revision anyway, and the README says to unset `WIDGENTIC_SEED_FILE` once
  the content is yours.

## Migration Plan

No data migration:
- **Theme entries:** gain an optional key.
- **Settings record:** absent reads as `{}`.
- **Old-shape tests:** each adapter loads pre-change themes and reports empty settings.
- **Stricter guards (D16):** a stored token value the new token rules refuse is dropped
  on read with a diagnostic; the theme itself is served (old-shape tests in SQLite,
  Cosmos and the file store). Style entries the new selector and value rules refuse are
  dropped when CSS is generated, as unsafe entries always were. Before the
  widgentic.dev deploy, the apps change `adopt-theme-settings` runs a read-only scan of
  the stored themes and widget styles under the new guards and records how many entries
  are affected in its RUNBOOK.

Rollback by redeploying the previous version:
- **Old code ignores `styles`:** themes validate on tokens only.
- **Old code never reads the settings record:** the SQLite row has its own kind, the
  Cosmos document sits outside the entry prefixes, and the file store ignores a top-level
  `settings.json`.

Release:
- core, designer and mcp minor, webmcp patch.
- After publishing, the apps change `adopt-theme-settings` (widgentic/apps) adopts the new
  versions and deploys; its work is tracked there, not here.

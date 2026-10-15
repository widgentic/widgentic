## ADDED Requirements

### Requirement: Stylesheet resources reach the frame and the page
The server assembly SHALL accept `resources`: the caller's stylesheet entries, in the store's shape, typically from `composeResources`.
- **What is delivered.** Each entry SHALL be re-read by the core resource rule. Entries it refuses, and entries whose host the declared resource domains (after the domain rule) do not cover, SHALL be dropped and never delivered. The kept entries, in order, are the caller's stylesheets.
- **Results.** `render_widget`, `preview_widget` and `execute_action` results that carry `structuredContent` SHALL carry the stylesheets as `structuredContent.resources`, each `{ type, href, integrity? }`. The key SHALL be absent when there are none.
- **The app template.** It SHALL keep one `<link rel="stylesheet">` in its document head per entry of the latest result's or preview's `resources`.
  - **Placement.** In order, before the element carrying the result CSS, so theme and widget rules win ties.
  - **Integrity.** With `integrity` and `crossorigin="anonymous"` when the entry gives an integrity value.
  - **Sync.** A link whose entry is still listed SHALL be kept, not reloaded. A link no longer listed SHALL be removed. A result without `resources` SHALL remove them all.
  - **Ignored entries.** An entry that is not a `stylesheet` with an `https://` address SHALL be ignored.
  - **No other path.** The frame SHALL load stylesheets in no other way.
- **Documents.** A `page` document SHALL carry the same links, attribute-escaped, in its head before its styles. An `html` fragment and the widgentic payload block SHALL NOT carry them: both are placed in a host's own page.
- **Unchanged without stylesheets.** For a caller with none, every result and document SHALL be byte-identical to one rendered before this requirement.
- **The host bundle.** A configuration's `settings` record MAY carry `resources`.
  - **Checking.** Its entries SHALL be checked by the same rule. A refused entry, and an entry no declared domain covers (the configuration's, then the settings'), SHALL be skipped and reported by `problems()` with section `settings`, the entry as name and `INVALID_RESOURCE` or `UNDECLARED_DOMAIN`.
  - **Delivery.** The rest SHALL be delivered as above.
- **Size.** The app template SHALL stay within "App template size budget".

#### Scenario: A render carries the caller's stylesheets
- **WHEN** the assembly is created with `resourceDomains: ["fonts.googleapis.com", "fonts.gstatic.com"]` and `resources: [{ type: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" }]`, and `render_widget` renders a card
- **THEN** `structuredContent.resources` SHALL equal that list

#### Scenario: An uncovered stylesheet is never delivered
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.org"]` and a stylesheet on `fonts.googleapis.com`
- **THEN** no result SHALL carry `resources`

#### Scenario: Nothing changes without stylesheets
- **WHEN** the assembly is created with no `resources`
- **THEN** a render's `structuredContent` SHALL have no `resources` key, and its documents SHALL be byte-identical to the corpus recorded before this requirement

#### Scenario: The frame links each stylesheet before the widget CSS
- **WHEN** the app template receives a tool result whose `resources` hold stylesheet A and stylesheet B with an integrity value
- **THEN** the document head SHALL hold two stylesheet links, A then B, both before the result CSS element, and B's SHALL carry the integrity value and `crossorigin="anonymous"`

#### Scenario: The frame keeps its links in step with each result
- **WHEN** a later result lists only B, and a third result lists none
- **THEN** after the second, the head SHALL hold B's same link element and no link for A
- **AND** after the third, it SHALL hold no stylesheet link

#### Scenario: Previews carry the stylesheets too
- **WHEN** a streamed render's server preview (`preview_widget`) returns `resources`
- **THEN** the frame SHALL link them before the final result arrives

#### Scenario: Unsafe entries are ignored by the frame
- **WHEN** a result's `resources` hold `{ type: "script", href: "https://cdn.example.org/x.js" }` and `{ type: "stylesheet", href: "http://cdn.example.org/a.css" }`
- **THEN** the frame SHALL add no element for either

#### Scenario: Page documents link them, fragments never
- **WHEN** a caller with a stylesheet renders with `format: "page"` and with `format: "html"`
- **THEN** the page document's head SHALL hold the stylesheet link before its styles
- **AND** neither the `html` text nor the payload block SHALL mention the stylesheet

#### Scenario: The host bundle reads them from settings
- **WHEN** a host is created with `resourceDomains: ["fonts.googleapis.com"]` and `settings: { resources: [<a stylesheet on fonts.googleapis.com>, <one on cdn.example.org>, { type: "script", href: "https://fonts.googleapis.com/x.js" }] }`
- **THEN** its renders SHALL carry only the first in `structuredContent.resources`
- **AND** `problems()` SHALL report the second as `UNDECLARED_DOMAIN` and the third as `INVALID_RESOURCE`, each under section `settings`

## MODIFIED Requirements

### Requirement: Structured content for app templates
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload, tree }` — the rendered fragment, the generated theme/kind CSS, the validated payload, and the render tree (`WidgetNode`, JSON-serializable) the fragment was serialized from — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. `tree` and `html` SHALL be projections of the same render (never divergent). For `group` renders, `css` SHALL union the registered styles of the group and every distinct item kind, each kind's block exactly once. Per the Apps convention, `structuredContent` is presentation data, not model context. When hint diagnostics exist for the render, `structuredContent` SHALL additionally carry them as a `diagnostics` array; the key SHALL be absent when there are none. When the rendered kind declares a `load` binding and the caller holds the `execute` scope, `structuredContent` SHALL additionally carry `load: { id: "load", widget, args }` with the binding's input mapping resolved against the rendered payload; the key SHALL be absent otherwise. For a `group` render, each item whose kind declares `load` SHALL contribute a descriptor to `structuredContent.loads` (an array; each entry stamped with the item's `widget` and `at`), which the frame executes one after another. When the caller has stylesheets ("Stylesheet resources reach the frame and the page"), `structuredContent` SHALL additionally carry them as `resources`, and the key SHALL be absent when there are none. `execute_action` results SHALL carry the same `structuredContent` shape.

#### Scenario: Structured content on default renders
- **WHEN** `render_widget` runs with no `format` and a valid payload
- **THEN** the result SHALL include `structuredContent.html` containing the widget markup
- **AND** `structuredContent.payload.kind` SHALL match the rendered widget

#### Scenario: Theme and styles reach the template channel
- **WHEN** a render includes a valid `theme` and the kind has registered styles
- **THEN** `structuredContent.css` SHALL contain the `--wg-*` declarations and the kind's style rules

#### Scenario: Diagnostics ride the template channel when present
- **WHEN** a render produces hint diagnostics
- **THEN** `structuredContent.diagnostics` SHALL be the same array surfaced in the `Hint notes:` text

#### Scenario: Tree and html are the same render
- **WHEN** any successful render is inspected
- **THEN** serializing `structuredContent.tree` with `renderToHtml` SHALL reproduce `structuredContent.html` exactly

#### Scenario: Group renders union item styles
- **WHEN** a `group` render includes items of two custom kinds with registered styles
- **THEN** `structuredContent.css` SHALL contain both kinds' style rules exactly once each

#### Scenario: Group items load one after another
- **WHEN** a `group` renders two items whose kinds declare `load`, for a caller with `execute`
- **THEN** `structuredContent.loads` SHALL carry two descriptors with `at: "data.items.0"` and `at: "data.items.1"`, and the frame SHALL execute the second only after the first has settled

#### Scenario: Load descriptors ride the template channel
- **WHEN** a kind with a `load` binding mapping `{ id: "record.id" }` renders `{ record: { id: 42 } }` for a caller with `execute`
- **THEN** `structuredContent.load` SHALL be `{ id: "load", widget: <kind>, args: { id: 42 } }`
- **AND** for a caller without `execute`, or a kind without `load`, the key SHALL be absent

#### Scenario: Stylesheets ride the template channel when present
- **WHEN** a caller with one delivered stylesheet renders, and a caller with none renders
- **THEN** the first result's `structuredContent.resources` SHALL hold that stylesheet, and the second result SHALL have no `resources` key

### Requirement: Named theme listing tool
The server SHALL expose `list_themes` (no input): a discovery tool returning every registered theme as `{ name, label?, description?, tokens, styles? }` so an agent can pick a theme by name instead of composing tokens and can use the classes a theme's styles define, plus `defaults: { light, dark }` naming the theme each mode uses when a render names none — a built-in name when the caller's settings choose none — and, when the caller has delivered stylesheets, `resources: [{ type, href }]`, so an agent drafting a template knows which classes a stylesheet provides (an icon font's, say). The key SHALL be absent when there are none. Its description SHALL tell agents that leaving `render_widget`'s `theme` out uses those defaults and that a passed theme replaces them, and `render_widget`'s `theme` description SHALL say the same. `handleListThemes(registry)` SHALL be a pure handler taking the registry explicitly, mirroring `handleListWidgets(catalog)`.

#### Scenario: Registered themes are listed with their tokens
- **WHEN** `handleListThemes(registry)` runs on a registry holding `light`, `dark`, and a registered `brand`
- **THEN** the parsed result SHALL contain all three entries with their token maps, and `defaults` SHALL be `{ "light": "light", "dark": "dark" }`
- **AND** each listed name SHALL be usable as `render_widget`'s `theme` input

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools
- **THEN** `list_themes` SHALL appear alongside `list_widgets`, `list_theme_tokens`, and `render_widget`

#### Scenario: Styles and default themes are listed
- **WHEN** `handleListThemes(registry)` runs on a registry whose `brand` entry carries `styles` and whose light default is `brand`
- **THEN** the `brand` entry SHALL carry its `styles`, and `defaults` SHALL be `{ "light": "brand", "dark": "dark" }`

#### Scenario: Stylesheets are listed for the agent
- **WHEN** a caller with a delivered Material Icons stylesheet calls `list_themes`
- **THEN** the result SHALL carry `resources: [{ type: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" }]`
- **AND** for a caller with none, the key SHALL be absent

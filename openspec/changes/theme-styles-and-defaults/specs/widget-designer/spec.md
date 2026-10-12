## MODIFIED Requirements

### Requirement: Preview theme selection in the widget designer
The widget designer SHALL accept `options.themes` — a list of named theme entries — and offer them as the preview theme through a selector (including a "none" choice for the built-in defaults), applying the chosen entry's tokens to the live preview. A host SHALL be able to name one of those entries as `options.previewTheme`: the designer SHALL open with it selected and applied — its tokens and its styles — and a name matching no supplied entry SHALL be ignored, leaving "none". Loading a widget definition SHALL keep the selected preview theme, tokens and styles alike, and loading a bare token map through `loadTheme` SHALL layer it over the selected entry: the selection and the entry's styles stay, the map's tokens win over the entry's, and each load replaces the previous layer, so `{}` returns to the entry exactly; with no entry selected the map is the whole preview theme. Only the person's choice in the selector changes the selection — a token map never selects an entry by its content — and choosing an entry, or none, replaces any layered tokens. The preview SHALL render the draft widget only — there is no kind selector; previewing arbitrary catalog kinds under a theme belongs to the standalone theme designer. Beside the theme selection, the designer SHALL show a compact read-only listing of the effective preview tokens — the selected entry merged over the defaults — with each token's name, its effective value, and a color swatch for `color`-typed tokens (type read from the registry's metadata, never inferred), so style authoring can reference `var(--wg-…)` by sight. The widget designer SHALL NOT edit theme tokens; theme authoring belongs to the standalone theme designer. The draft's theme selection SHALL NOT affect the exported widget definition, which stays `{ kind, template, descriptor }`.

#### Scenario: Supplied themes are selectable and applied
- **WHEN** a designer is created with `options.themes` containing a `dark` entry and that entry is selected
- **THEN** the preview SHALL carry the entry's tokens as `--wg-*` custom properties

#### Scenario: Theme selection never leaks into the export
- **WHEN** a theme is selected and the widget is exported
- **THEN** the exported JSON SHALL contain exactly `kind`, `template`, and `descriptor`

#### Scenario: No themes supplied is a valid embedding
- **WHEN** a designer is created without `options.themes`
- **THEN** it SHALL mount with the default preview appearance and no theme selector entries beyond "none"

#### Scenario: The preview renders the draft only
- **WHEN** the widget designer is mounted
- **THEN** its preview area SHALL offer no kind selection and SHALL render the current draft

#### Scenario: The token reference reflects the selected theme
- **WHEN** a `dark` entry is selected as the preview theme
- **THEN** the token listing SHALL show the entry's values (its `bg` over the default), with swatches on color-typed tokens
- **AND** selecting "none" SHALL show the defaults

#### Scenario: A host preselects the preview theme
- **WHEN** a designer is created with `options.themes` holding a `brand` entry that carries styles and `options.previewTheme: "brand"`
- **THEN** the selector SHALL show `brand` and the preview SHALL carry its tokens and its styles from the first render
- **AND** choosing "none" SHALL still remove both, and `options.previewTheme: "missing"` SHALL open with "none"

#### Scenario: A token map layers over the chosen theme
- **WHEN** `tide` (tokens and styles) is the selected preview theme and the host calls `loadTheme({ accent: "#123456" })`
- **THEN** the selector SHALL still show `tide`, and the preview SHALL carry `accent: #123456`, `tide`'s other tokens and `tide`'s styles
- **AND WHEN** the host then calls `loadTheme({})`
- **THEN** the preview tokens SHALL equal `tide`'s exactly

#### Scenario: Loading a widget keeps the preview theme
- **WHEN** `brand` is the selected preview theme and the host loads another widget definition
- **THEN** the preview SHALL still carry `brand`'s tokens and styles

#### Scenario: An empty token map is not a named theme
- **WHEN** the designer was given the built-in `light` entry (whose token map is empty), no entry is selected, and the host calls `loadTheme({})`
- **THEN** the selector SHALL show "none"
- **AND WHEN** the host calls `loadTheme({ accent: "#123456" })`
- **THEN** the selector SHALL still show "none" and the preview SHALL carry exactly those tokens and no shared styles

### Requirement: Designer programmatic surface
The package SHALL export from a `./designer` entry: `createDesigner(container: Element, options?)` returning a handle `{ getDraft(), loadWidget(definition), loadTheme(theme), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createThemeDesigner(container: Element, options?)` returning `{ getTheme(), loadTheme(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSchemaDesigner(container: Element, options?)` returning `{ getSchema(), loadSchema(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createActionDesigner(container: Element, options?)` returning `{ getAction(), loadAction(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSettingsDesigner(container: Element, options?)` returning `{ getSettings(), loadSettings(settings), setThemes(themes), setReadOnly(readOnly), subscribe(listener), dispose() }`, and the opt-in element registrars `defineDesignerElement(tagName?)` (default `widgentic-designer`), `defineThemeDesignerElement(tagName?)` (default `widgentic-theme-designer`), `defineSchemaDesignerElement(tagName?)` (default `widgentic-schema-designer`) and `defineActionDesignerElement(tagName?)` (default `widgentic-action-designer`) and `defineSettingsDesignerElement(tagName?)` (default `widgentic-settings-designer`), each wrapping its factory and emitting `widgentic-change` CustomEvents whose `detail` carries the serialized draft, theme entry, schema entry, action entry, or settings record. All five factories SHALL accept `readOnly` in options and every handle SHALL expose `setReadOnly(readOnly)`: in read-only mode every editing surface is inert — visible but inoperable and visibly de-emphasized — while the preview stays live along with the widget designer's preview-theme selector, the theme designer's preview-kind selector, and the Export controls (export copies out what is already on screen; read-only restricts editing, not looking). `createDesigner` SHALL additionally accept `options.actions` (the shared actions offered for binding) and `options.secretNames`. Custom-element registration SHALL only happen through the explicit calls — importing the module SHALL have no registry side effects. The entry SHALL import other capabilities only through their public package entries, and SHALL perform no network I/O.

#### Scenario: Factory mounts and disposes cleanly
- **WHEN** `createDesigner(container)` is called and later `dispose()`
- **THEN** the designer UI SHALL render inside `container` and be fully removed on dispose

#### Scenario: Multiple instances coexist
- **WHEN** two designers are created in one document
- **THEN** edits in one SHALL NOT affect the other's draft or preview

#### Scenario: Element registration is explicit
- **WHEN** the module is imported without calling `defineDesignerElement`
- **THEN** `customElements.get("widgentic-designer")` SHALL be undefined
- **AND WHEN** `defineDesignerElement()` is called and an element is attached
- **THEN** edits SHALL dispatch `widgentic-change` events with the serialized draft

#### Scenario: The theme designer is independently embeddable
- **WHEN** `createThemeDesigner(container)` is called
- **THEN** a theme editor SHALL mount without any widget-authoring panels
- **AND** `defineThemeDesignerElement()` SHALL register `widgentic-theme-designer` on the explicit call only

#### Scenario: Read-only mode disables editing but keeps the preview live
- **WHEN** a designer is created with `readOnly: true` or `setReadOnly(true)` is called
- **THEN** its editing surfaces SHALL be inert while the preview keeps rendering
- **AND** the widget designer's preview-theme selector (and the theme designer's preview-kind selector) SHALL remain operable, updating the preview
- **AND** `setReadOnly(false)` SHALL restore editing

#### Scenario: Read-only leaves export operable
- **WHEN** a designer is mounted read-only
- **THEN** its Export controls SHALL remain clickable and produce the current definition

#### Scenario: The schema designer is independently embeddable
- **WHEN** `createSchemaDesigner(container)` is called
- **THEN** a schema editor SHALL mount without any widget-authoring or theme panels
- **AND** `defineSchemaDesignerElement()` SHALL register `widgentic-schema-designer` on the explicit call only
- **AND** mounted read-only, its editing surfaces SHALL be inert while the schema stays visible

#### Scenario: The action designer registers on the explicit call only
- **WHEN** the module is imported without calling `defineActionDesignerElement`
- **THEN** `customElements.get("widgentic-action-designer")` SHALL be undefined
- **AND WHEN** it is called and an element is attached
- **THEN** edits SHALL dispatch `widgentic-change` events carrying the serialized action entry

#### Scenario: The settings designer is independently embeddable
- **WHEN** `createSettingsDesigner(container)` is called
- **THEN** a settings editor SHALL mount without any widget, theme, schema or action panels
- **AND** `defineSettingsDesignerElement()` SHALL register `widgentic-settings-designer` on the explicit call only, its element dispatching `widgentic-change` events carrying the serialized settings record

### Requirement: Theme designer for catalog widgets
The standalone theme designer SHALL edit a named theme entry — identity (`name`, optional `label`/`description`) plus a plain token map over `THEME_TOKENS` (one control per registry token, with the control chosen from the token's declared `type` — `color` tokens showing a picker/swatch of the effective value — and its documented `use` surfaced as help text) and author-defined `x-*` custom variables (add/rename/remove) — plus a Styles section editing the theme's `styles` with the widget designer's own styles panel (the same Tree and JSON tabs, the same `.wg-` selector discipline, and the same audit flagging entries the renderer would drop), placed directly under the preview as in the widget designer and inert in read-only mode; the JSON tab SHALL refuse a value that is not a styles map, keeping the last valid one, and SHALL treat an empty map as no styles — validating on every change and previewing against any kind in its scratch catalog, with the theme's styles applied to the preview beneath the previewed kind's own styles. It SHALL accept host-supplied custom widget definitions in `options.widgets` and offer them alongside the built-in kinds in its preview-kind selector, rendering each with its own descriptor styles — a theme is judged against the widgets it will actually dress. A supplied definition that fails template validation SHALL be skipped without breaking the designer. Unsafe token values SHALL be flagged inline with the validator's error and excluded from the applied preview theme. Export SHALL produce the registry entry shape (`{ name, label?, description?, tokens, styles? }`, `styles` omitted when empty) and import SHALL accept the same, re-validating — `styles` shape included — before it replaces the working entry. Whether a theme is a default is a principal setting, edited in the settings designer, not part of the entry.

#### Scenario: Token edits preview immediately
- **WHEN** the `surface` token is set to a color distinct from `bg` with a `card` preview selected
- **THEN** the previewed card SHALL reflect the new surface immediately

#### Scenario: Unsafe values are flagged and not applied
- **WHEN** a token value contains `url(https://evil.example/x)`
- **THEN** the control SHALL show the `INVALID_TOKEN_VALUE` error and the preview SHALL not apply that value

#### Scenario: Custom variables are editable and previewed
- **WHEN** a custom variable `x-badge-gap` is added with value `4px`
- **THEN** it SHALL be applied to the preview as `--wg-x-badge-gap`
- **AND** it SHALL appear in the exported entry's tokens

#### Scenario: Export and import use the registry entry shape
- **WHEN** an edited entry is exported and re-imported
- **THEN** the resulting entry SHALL deep-equal the original
- **AND** an entry whose tokens fail validation SHALL be rejected without replacing the working entry

#### Scenario: Custom widgets are previewable under the theme
- **WHEN** a theme designer is created with `options.widgets` carrying a custom definition
- **THEN** its kind selector SHALL offer that kind beside the built-ins
- **AND** selecting it SHALL render that widget from its own `dataExample`, with its descriptor styles applied and the edited tokens in effect
- **AND** a definition with an invalid template SHALL be skipped while the rest stay selectable

#### Scenario: Theme styles are edited with the widget designer's panel
- **WHEN** the theme designer mounts
- **THEN** it SHALL show a Styles section offering Tree and JSON tabs over the entry's `styles`
- **AND** adding the selector `.wg-btn` with `padding: 4px 8px` in the Tree tab SHALL put `{ ".wg-btn": { "padding": "4px 8px" } }` in the exported entry

#### Scenario: Theme styles dress the preview
- **WHEN** the theme defines `.wg-card-title { color: rgb(1, 2, 3) }` with a `card` preview selected
- **THEN** the previewed card title's computed color SHALL be `rgb(1, 2, 3)`

#### Scenario: The JSON tab admits only the styles shape
- **WHEN** the JSON tab receives `{".wg-btn": "padding: 4px"}` and then `{}`
- **THEN** the first SHALL be refused with a message and the entry's styles SHALL stay as they were, and the second SHALL leave the entry with no `styles`

#### Scenario: Style entries the renderer would drop are flagged
- **WHEN** the theme's styles hold a `body` selector
- **THEN** the Styles section SHALL flag that entry exactly as the widget designer flags it, and the preview SHALL not apply it

## ADDED Requirements

### Requirement: Theme styles in the widget designer's preview
When the widget designer's preview theme is a supplied entry carrying `styles`, the preview SHALL apply those styles beneath the draft's own descriptor styles, so classes a theme defines (a shared `.wg-btn`, say) look in the draft as they will in a render under that theme. Choosing "none" SHALL apply no theme styles. The selection SHALL still never reach the exported widget.

#### Scenario: A preview theme's shared class dresses the draft
- **WHEN** the preview theme defines `.wg-btn { color: rgb(1, 2, 3) }` and the draft's template renders a `button` with class `wg-btn`
- **THEN** the previewed button's computed color SHALL be `rgb(1, 2, 3)`
- **AND** a draft style `.wg-btn { color: rgb(4, 5, 6) }` SHALL win, and choosing "none" SHALL remove the theme's rule

### Requirement: Settings designer
The settings designer SHALL edit a principal's settings record (`{ defaultThemes?: { light?, dark? } }` in this version) in titled subsections, starting with "Default themes": one choice for light hosts and one for dark hosts, each offering the built-in theme of that mode (the choice that leaves the mode unset) and every theme entry the host supplies in `options.themes`. Because each mode holds one choice, choosing a theme for a mode replaces whatever that mode held, and the same theme SHALL be selectable for both. A supplied settings record naming a theme absent from `options.themes` SHALL show that name as unavailable and selected, so the person sees the problem and picks another, and SHALL NOT be silently changed. `getSettings()` SHALL return the record with built-in choices omitted, keep any section the designer does not edit exactly as it was supplied, and `subscribe` listeners SHALL be notified on every change. In read-only mode the choices SHALL be inert. `setThemes(themes)` SHALL replace the offered themes and keep the record, and the custom element SHALL take the themes through a `themes` property, settable before or after it connects, or before the element is defined (adopted at upgrade). Saving is the host's: the designer writes nothing.

#### Scenario: Choosing defaults edits the record
- **WHEN** the designer is created with themes `ocean` and `night` and no settings, and the person picks `ocean` for light hosts and `night` for dark hosts
- **THEN** `getSettings()` SHALL return `{ defaultThemes: { light: "ocean", dark: "night" } }` and listeners SHALL have been notified
- **AND** picking the built-in for dark hosts SHALL make it return `{ defaultThemes: { light: "ocean" } }`

#### Scenario: One theme can serve both modes
- **WHEN** the person picks `ocean` for both light and dark hosts
- **THEN** `getSettings()` SHALL return `{ defaultThemes: { light: "ocean", dark: "ocean" } }`

#### Scenario: A missing theme is shown, not dropped
- **WHEN** the designer is loaded with `{ defaultThemes: { dark: "gone" } }` and `options.themes` holds no `gone`
- **THEN** the dark choice SHALL show `gone` as unavailable and selected, and `getSettings()` SHALL still return it until the person picks another

#### Scenario: Sections it does not edit survive
- **WHEN** the designer is loaded with `{ defaultThemes: { light: "ocean" }, fonts: { body: "Inter" } }` and the person changes the light choice
- **THEN** `getSettings()` SHALL still carry `fonts` unchanged

#### Scenario: Read-only settings are visible but inert
- **WHEN** the designer is created with `readOnly: true`
- **THEN** both choices SHALL show their values and SHALL NOT be operable

#### Scenario: The element is given themes
- **WHEN** a `<widgentic-settings-designer>` gets `themes` before it connects, the person picks one for light hosts, and later `themes` grows by `dusk`
- **THEN** the change event SHALL carry `{ settings: { defaultThemes: { light: <picked> } } }`, and `dusk` SHALL then be offered for both modes with the record unchanged

### Requirement: Designers refuse at import what saving would refuse
The widget designer's import (and `loadWidget`) SHALL refuse a definition whose `kind` is not a safe identifier — the same pattern the store enforces, exported by core as `SAFE_IDENTIFIER` — with an `INVALID_IDENTIFIER` error, or names a built-in kind with a `RESERVED_KIND` error, and its diagnostics SHALL flag the draft's own kind the same way while the person types. The theme designer's import (and `loadTheme`) SHALL refuse a `name` that is not a safe identifier (`INVALID_IDENTIFIER`) or names a built-in theme (`RESERVED_THEME`), and its Name field SHALL show the same message inline while the person types, so a name saving would refuse is visible before Save. These identity checks SHALL apply only when a load changes the identity: a kind or name the draft or entry already has is the person's to fix, and reloading it with new data or tokens SHALL NOT be refused for it. The Styles panel's JSON tab SHALL clear its parse error once a valid value arrives through the Tree view or a load. The widget designer SHALL show a warning under the data-shape field while the shape is empty — agents listing the widget would see a placeholder — without affecting whether the draft previews.

#### Scenario: A built-in kind is refused on import
- **WHEN** a definition of kind `table` is imported into the widget designer
- **THEN** the import SHALL be refused with `RESERVED_KIND` and the draft SHALL be unchanged

#### Scenario: A built-in theme name is flagged while typing and refused on import
- **WHEN** the person types `dark` into the theme designer's Name field
- **THEN** the field SHALL show `RESERVED_THEME`, and typing `ocean` SHALL clear it
- **AND WHEN** an entry named `my theme` is loaded
- **THEN** the load SHALL be refused and the name SHALL stay `ocean`

#### Scenario: A kind the person typed does not block a reload
- **WHEN** the draft's kind is `my widget` and the host reloads the draft with new example data
- **THEN** the load SHALL succeed, the diagnostics SHALL flag `INVALID_IDENTIFIER`, and loading a definition of kind `table` SHALL still be refused

#### Scenario: An empty data shape warns without blocking the preview
- **WHEN** the draft's descriptor has no `dataShape`
- **THEN** the designer's diagnostics SHALL carry a `dataShape` warning shown under the field, and `previewable` SHALL be unaffected

### Requirement: Designers warn about schema keywords the validator ignores
The schema designer SHALL show, under its definition, every warning `auditDataSchema` reports for the entry's schema — a `type` name outside the supported set, a `pattern` the validator will not run, a subset keyword of the wrong shape — updated on every edit and load. The widget designer SHALL report the same for an inline `descriptor.dataSchema` as `diagnostics.dataSchema` and show it in its Data schema section. These SHALL be warnings only: the store accepts such schemas and the validator ignores what it cannot use, so loading, previewing and saving are unaffected.

#### Scenario: An unknown type is shown, not refused
- **WHEN** the schema designer loads `{ name: "fruit", schema: { type: "banana" } }`
- **THEN** the load SHALL succeed and a warning naming `schema.type` and `'banana'` SHALL be visible
- **AND WHEN** it loads a schema of type `string`
- **THEN** the warning SHALL be gone

#### Scenario: An inline schema warns in the widget designer
- **WHEN** a widget whose `descriptor.dataSchema` is `{ type: "banana" }` is loaded
- **THEN** the Data schema section SHALL show a warning naming `dataSchema.type`

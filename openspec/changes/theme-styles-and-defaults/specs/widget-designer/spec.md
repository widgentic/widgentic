## MODIFIED Requirements

### Requirement: Designer programmatic surface
The package SHALL export from a `./designer` entry: `createDesigner(container: Element, options?)` returning a handle `{ getDraft(), loadWidget(definition), loadTheme(theme), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createThemeDesigner(container: Element, options?)` returning `{ getTheme(), loadTheme(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSchemaDesigner(container: Element, options?)` returning `{ getSchema(), loadSchema(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createActionDesigner(container: Element, options?)` returning `{ getAction(), loadAction(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSettingsDesigner(container: Element, options?)` returning `{ getSettings(), loadSettings(settings), setReadOnly(readOnly), subscribe(listener), dispose() }`, and the opt-in element registrars `defineDesignerElement(tagName?)` (default `widgentic-designer`), `defineThemeDesignerElement(tagName?)` (default `widgentic-theme-designer`), `defineSchemaDesignerElement(tagName?)` (default `widgentic-schema-designer`) and `defineActionDesignerElement(tagName?)` (default `widgentic-action-designer`) and `defineSettingsDesignerElement(tagName?)` (default `widgentic-settings-designer`), each wrapping its factory and emitting `widgentic-change` CustomEvents whose `detail` carries the serialized draft, theme entry, schema entry, action entry, or settings record. All five factories SHALL accept `readOnly` in options and every handle SHALL expose `setReadOnly(readOnly)`: in read-only mode every editing surface is inert — visible but inoperable and visibly de-emphasized — while the preview stays live along with the widget designer's preview-theme selector, the theme designer's preview-kind selector, and the Export controls (export copies out what is already on screen; read-only restricts editing, not looking). `createDesigner` SHALL additionally accept `options.actions` (the shared actions offered for binding) and `options.secretNames`. Custom-element registration SHALL only happen through the explicit calls — importing the module SHALL have no registry side effects. The entry SHALL import other capabilities only through their public package entries, and SHALL perform no network I/O.

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
The standalone theme designer SHALL edit a named theme entry — identity (`name`, optional `label`/`description`) plus a plain token map over `THEME_TOKENS` (one control per registry token, with the control chosen from the token's declared `type` — `color` tokens showing a picker/swatch of the effective value — and its documented `use` surfaced as help text) and author-defined `x-*` custom variables (add/rename/remove) — plus a Styles section editing the theme's `styles` with the widget designer's own styles panel (the same Tree and JSON tabs, the same `.wg-` selector discipline, and the same audit flagging entries the renderer would drop) — validating on every change and previewing against any kind in its scratch catalog, with the theme's styles applied to the preview beneath the previewed kind's own styles. It SHALL accept host-supplied custom widget definitions in `options.widgets` and offer them alongside the built-in kinds in its preview-kind selector, rendering each with its own descriptor styles — a theme is judged against the widgets it will actually dress. A supplied definition that fails template validation SHALL be skipped without breaking the designer. Unsafe token values SHALL be flagged inline with the validator's error and excluded from the applied preview theme. Export SHALL produce the registry entry shape (`{ name, label?, description?, tokens, styles? }`, `styles` omitted when empty) and import SHALL accept the same, re-validating — `styles` shape included — before it replaces the working entry. Whether a theme is a default is a principal setting, edited in the settings designer, not part of the entry.

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
The settings designer SHALL edit a principal's settings record (`{ defaultThemes?: { light?, dark? } }` in this version) in titled subsections, starting with "Default themes": one choice for light hosts and one for dark hosts, each offering the built-in theme of that mode (the choice that leaves the mode unset) and every theme entry the host supplies in `options.themes`. Because each mode holds one choice, choosing a theme for a mode replaces whatever that mode held, and the same theme SHALL be selectable for both. A supplied settings record naming a theme absent from `options.themes` SHALL show that name as unavailable and selected, so the person sees the problem and picks another, and SHALL NOT be silently changed. `getSettings()` SHALL return the record with built-in choices omitted, keep any section the designer does not edit exactly as it was supplied, and `subscribe` listeners SHALL be notified on every change. In read-only mode the choices SHALL be inert. Saving is the host's: the designer writes nothing.

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

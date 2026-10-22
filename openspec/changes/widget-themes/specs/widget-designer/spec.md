## MODIFIED Requirements

### Requirement: Preview theme selection in the widget designer
The widget designer SHALL accept `options.themes` — a list of named theme entries — and offer them as the preview theme through a selector (including a "none" choice for the built-in defaults), applying the chosen entry's tokens to the live preview. A host SHALL be able to name one of those entries as `options.previewTheme`, the person's own pick (a remounted draft keeps it): the designer SHALL open with it selected and applied — its tokens and its styles — and a name matching no supplied entry SHALL be ignored, leaving "none". Without such a pick, the designer SHALL open on the theme the draft's `descriptor.themes` names for the scheme the designer shows (its pinned appearance, else the page's, else the system's) when that name is a supplied entry, and otherwise on `options.defaultPreviewTheme`, the host's fallback (its Settings default for that scheme), under the same matching rule. Loading a widget definition whose `descriptor.themes` names a supplied entry for the designer's scheme SHALL select that entry, tokens and styles, since the definition chooses its own look; loading one that names none for the scheme SHALL keep the selected preview theme, tokens and styles alike, and loading a bare token map through `loadTheme` SHALL layer it over the selected entry: the selection and the entry's styles stay, the map's tokens win over the entry's, and each load replaces the previous layer, so `{}` returns to the entry exactly; with no entry selected the map is the whole preview theme. Only the person's choice in the selector changes the selection — a token map never selects an entry by its content — and choosing an entry, or none, replaces any layered tokens. The preview SHALL render the draft widget only — there is no kind selector; previewing arbitrary catalog kinds under a theme belongs to the standalone theme designer. Beside the theme selection, the designer SHALL show a compact read-only listing of the effective preview tokens — the selected entry merged over the defaults — with each token's name, its effective value, and a color swatch for `color`-typed tokens (type read from the registry's metadata, never inferred), so style authoring can reference `var(--wg-…)` by sight. The widget designer SHALL NOT edit theme tokens; theme authoring belongs to the standalone theme designer. The draft's theme selection SHALL NOT affect the exported widget definition, which stays `{ kind, template, descriptor }`.

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
- **WHEN** `brand` is the selected preview theme and the host loads another widget definition that names no theme for the designer's scheme
- **THEN** the preview SHALL still carry `brand`'s tokens and styles

#### Scenario: A widget's own theme opens as the preview theme
- **WHEN** a light-scheme designer is created with `options.themes` holding `brand` and `acme`, `options.defaultPreviewTheme: "brand"`, and an `initialWidget` whose `descriptor.themes` is `{ light: "acme" }`
- **THEN** the selector SHALL show `acme` and the preview SHALL carry its tokens and styles
- **AND** the same designer with an `initialWidget` naming no theme SHALL open on `brand`, and with `options.previewTheme: "brand"` beside the widget's `acme` SHALL open on `brand`, the person's pick

#### Scenario: Loading a widget switches to its own theme
- **WHEN** `brand` is the selected preview theme and the host loads a definition whose `descriptor.themes` is `{ light: "acme", dark: "acme-night" }` in a dark-scheme designer
- **THEN** the selector SHALL show `acme-night` and the preview SHALL carry its tokens

#### Scenario: An empty token map is not a named theme
- **WHEN** the designer was given the built-in `light` entry (whose token map is empty), no entry is selected, and the host calls `loadTheme({})`
- **THEN** the selector SHALL show "none"
- **AND WHEN** the host calls `loadTheme({ accent: "#123456" })`
- **THEN** the selector SHALL still show "none" and the preview SHALL carry exactly those tokens and no shared styles

## ADDED Requirements

### Requirement: The widget designer sets the widget's themes
The widget designer SHALL offer two selects, light and dark, that edit the draft's `descriptor.themes`. Each SHALL offer:
- "Settings default", which omits that mode, and omits `themes` entirely once both modes are omitted;
- the built-ins `light` and `dark`;
- every entry of `options.themes`.

Loading a widget SHALL show its `themes`. A name matching no option SHALL stay selected as a marked "missing" option, so it is visible rather than silently dropped. Choosing a supplied entry for the light mode SHALL also make that entry the preview theme, a choice the person made, so the preview shows the look they picked. Export SHALL carry `themes` inside `descriptor`, keeping the exported keys `kind`, `template` and `descriptor`.

#### Scenario: Choosing themes edits the descriptor
- **WHEN** a designer created with `options.themes` holding `acme` sets light to `acme` and dark to the built-in `dark`
- **THEN** the draft's `descriptor.themes` SHALL be `{ light: "acme", dark: "dark" }`, the preview theme selector SHALL show `acme`, and the export's `descriptor.themes` SHALL match

#### Scenario: Settings default omits the mode
- **WHEN** both selects are set back to "Settings default"
- **THEN** the draft's descriptor SHALL carry no `themes` key

#### Scenario: A missing theme stays visible
- **WHEN** a widget naming `light: "ghost"` is loaded and no supplied entry is `ghost`
- **THEN** the light select SHALL show `ghost` marked missing, and the draft SHALL keep the name until the person changes it

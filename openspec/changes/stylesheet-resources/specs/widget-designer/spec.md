## ADDED Requirements

### Requirement: The island loads the person's stylesheets
The widget and theme designers SHALL accept `resources`: stylesheet entries in the settings record's shape.
- **Island mode.** Each preview's structured content SHALL carry the entries that pass the core resource rule, in order, as `resources`, so the frame links them under the frame policy that grants the person's domains.
- **In-page mode.** The option SHALL have no effect, and no stylesheet link SHALL be added to the page.
- **Without the option, or with none passing,** previews SHALL carry no `resources` key.

#### Scenario: The island previews with the stylesheets
- **WHEN** a widget designer is created with a `previewFrame` and `resources` holding a Material Icons stylesheet and an entry of type `"script"`, and the frame initializes
- **THEN** each `tool-result` the designer sends SHALL carry `resources` holding only the stylesheet

#### Scenario: The page never links them
- **WHEN** a widget designer without `previewFrame` is created with the same `resources`
- **THEN** the page SHALL hold no stylesheet link the designer added

## MODIFIED Requirements

### Requirement: Settings designer
The settings designer SHALL edit a principal's settings record (`{ defaultThemes?: { light?, dark? }, resourceDomains?: string[], resources?: { type, href, integrity? }[] }` in this version) in titled subsections, starting with "Default themes": one choice for light hosts and one for dark hosts, each offering the built-in theme of that mode (the choice that leaves the mode unset) and every theme entry the host supplies in `options.themes`. Because each mode holds one choice, choosing a theme for a mode replaces whatever that mode held, and the same theme SHALL be selectable for both. A supplied settings record naming a theme absent from `options.themes` SHALL show that name as unavailable and selected, so the person sees the problem and picks another, and SHALL NOT be silently changed. A second subsection, "Resource domains", SHALL list the record's domains for the person to add, edit and remove. Each entry SHALL be checked as it is edited by the rule and limit the store applies, exported by the core package. A valid entry SHALL be recorded and shown in its canonical `https://` form. An invalid entry SHALL be recorded as typed and marked with the rule's reason, never dropped, so a save's refusal names it. The add control SHALL be disabled at the limit. The subsection SHALL state the accepted forms and the limit, derived from the exported rule. It SHALL also state the trust a declaration grants: hosts that honor declared domains may load images from a listed domain directly when the server does not inline them, so any render, including image addresses an agent supplies, may load from that domain in the viewer's browser, and only domains the person controls belong there. A third subsection, "Stylesheets", SHALL list the record's stylesheets for the person to add, edit and remove, each an address with an optional integrity value. Each entry SHALL be checked as it is edited by the resource rule and limit exported by the core package, as the store applies them. An invalid entry SHALL be recorded as typed and marked with the rule's reason, never dropped. An entry whose host none of the listed domains covers SHALL be marked with the domain to add to "Resource domains". The add control SHALL be disabled at the limit. The subsection SHALL state the accepted form and the limit, derived from the exported rule, and SHALL state that a stylesheet's fonts come from their own domain, which must be listed too. `getSettings()` SHALL return the record with built-in choices omitted. It SHALL carry `resourceDomains`, and likewise `resources`, whenever the supplied record had it or the person edited the list, possibly empty, so a save clears a list the person emptied. It SHALL keep any section the designer does not edit exactly as it was supplied, and `subscribe` listeners SHALL be notified on every change. `loadSettings` SHALL refuse a record whose `resourceDomains` is not an array of strings, or whose `resources` is not an array of objects, keeping the current record. In read-only mode the choices, the domain list and the stylesheet list SHALL be inert. `setThemes(themes)` SHALL replace the offered themes and keep the record, and the custom element SHALL take the themes through a `themes` property, settable before or after it connects, or before the element is defined (adopted at upgrade). Saving is the host's: the designer writes nothing.

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
- **THEN** both choices and every listed domain SHALL show their values, and none SHALL be operable

#### Scenario: The element is given themes
- **WHEN** a `<widgentic-settings-designer>` gets `themes` before it connects, the person picks one for light hosts, and later `themes` grows by `dusk`
- **THEN** the change event SHALL carry `{ settings: { defaultThemes: { light: <picked> } } }`, and `dusk` SHALL then be offered for both modes with the record unchanged

#### Scenario: Adding a domain records its canonical form
- **WHEN** the designer is created with no settings and the person adds `CDN.example.com`
- **THEN** the entry SHALL show as `https://cdn.example.com`, and `getSettings().resourceDomains` SHALL be `["https://cdn.example.com"]`, with listeners notified

#### Scenario: An invalid domain is kept and marked
- **WHEN** the person adds `http://cdn.example.com`
- **THEN** the entry SHALL be marked with the rule's reason, and `getSettings().resourceDomains` SHALL carry `http://cdn.example.com` as typed

#### Scenario: Emptying the list clears it
- **WHEN** the designer is loaded with `{ resourceDomains: ["https://cdn.example.com"] }` and the person removes that entry
- **THEN** `getSettings().resourceDomains` SHALL be `[]`
- **AND** a designer loaded with `{ defaultThemes: { light: "ocean" } }` whose list is never edited SHALL return no `resourceDomains`

#### Scenario: The limit disables adding
- **WHEN** the designer is loaded with as many domains as the exported limit
- **THEN** the add control SHALL be disabled, and removing one entry SHALL enable it

#### Scenario: A malformed list is refused on load
- **WHEN** `loadSettings({ resourceDomains: "cdn.example.com" })` is called
- **THEN** it SHALL return `{ ok: false }` with an error naming `resourceDomains`, and the record SHALL be unchanged

#### Scenario: The subsection states its rule and its trust
- **WHEN** the designer renders the "Resource domains" subsection
- **THEN** its text SHALL state the exported limit's value and the accepted forms, and that any render may load from a listed domain in the viewer's browser

#### Scenario: Adding a stylesheet records it
- **WHEN** the record's domains cover `fonts.googleapis.com` and the person adds `https://fonts.googleapis.com/icon?family=Material+Icons`
- **THEN** `getSettings().resources` SHALL be `[{ type: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" }]`

#### Scenario: An uncovered stylesheet is marked with its domain
- **WHEN** the record's domains do not cover `fonts.googleapis.com` and the person adds a stylesheet there
- **THEN** the entry SHALL be recorded and marked, naming `fonts.googleapis.com` as the domain to add
- **AND** adding that domain under "Resource domains" SHALL clear the mark

#### Scenario: An invalid stylesheet is kept and marked
- **WHEN** the person adds `http://cdn.example.org/a.css`
- **THEN** the entry SHALL be recorded as typed and marked with the rule's reason

#### Scenario: The stylesheet limit disables adding
- **WHEN** the record holds 8 stylesheets
- **THEN** the stylesheet add control SHALL be disabled

#### Scenario: A malformed stylesheet list is refused on load
- **WHEN** `loadSettings({ resources: "https://cdn.example.org/a.css" })` is called
- **THEN** it SHALL be refused, and the current record SHALL be kept

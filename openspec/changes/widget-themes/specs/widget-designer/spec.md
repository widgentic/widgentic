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

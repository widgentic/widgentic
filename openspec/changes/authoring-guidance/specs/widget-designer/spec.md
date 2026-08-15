# widget-designer — draft-only preview, tokens in sight

## MODIFIED Requirements

### Requirement: Preview theme selection in the widget designer
The widget designer SHALL accept `options.themes` — a list of named theme entries — and offer them as the preview theme through a selector (including a "none" choice for the built-in defaults), applying the chosen entry's tokens to the live preview. The preview SHALL render the draft widget only — there is no kind selector; previewing arbitrary catalog kinds under a theme belongs to the standalone theme designer. Beside the theme selection, the designer SHALL show a compact read-only listing of the effective preview tokens — the selected entry merged over the defaults — with each token's name, its effective value, and a color swatch for `color`-typed tokens (type read from the registry's metadata, never inferred), so style authoring can reference `var(--wg-…)` by sight. The widget designer SHALL NOT edit theme tokens; theme authoring belongs to the standalone theme designer. The draft's theme selection SHALL NOT affect the exported widget definition, which stays `{ kind, template, descriptor }`.

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

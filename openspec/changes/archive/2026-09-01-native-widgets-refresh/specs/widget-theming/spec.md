## MODIFIED Requirements

### Requirement: Predefined base stylesheet
`baseStylesheet` SHALL begin with a generated `:root` block **defining every registry token with its default value**, so custom widget styles may reference bare `var(--wg-<token>)` and always resolve — an applied theme overrides these definitions rather than being the only source of them (before this, any token the active theme did not set was undefined, silently invalidating custom-style declarations on every surface). A token whose metadata declares a `fallback` token SHALL be defined in that block as a chain through the fallback (`--wg-<token>: var(--wg-<fallback>, <default>)`) rather than as a bare literal, so defining the token does not sever the inheritance its rules promise — a literal default at `:root` makes a `var(--wg-<token>, …)` fallback unreachable, since a `var()` fallback applies only when the property is unset. `baseStylesheet` SHALL style the documented `wg-*` classes (`wg-card`, `wg-table`, `wg-tree`, `wg-code`, `wg-template`, `wg-img` with its shape modifiers `wg-img-avatar`, `wg-img-thumb`, `wg-img-hero`, `wg-img-icon`, and their sub-element classes) using only `var(--wg-<token>, <fallback>)` references to registry tokens, with light-theme fallback values. Widget surface backgrounds (`wg-card`, `wg-table`, `wg-code`) SHALL read `var(--wg-surface, var(--wg-bg, <light default>))` so that themes without a `surface` value inherit `bg` exactly as before, while themes may set the two independently. Text SHALL derive its density from the `line-height` token, its emphasis from `font-weight-bold`, and monospace content (`wg-code`, a block utility no built-in emits — it is the styling surface template authors opt into) from `font-mono`; hairlines SHALL derive their thickness from `border-width`. The stylesheet SHALL additionally define status utility classes (`wg-status` with `wg-status-danger|success|warning|info|accent`) pairing each status color with its `-fg` text color, so status tokens are consumed rather than decorative. EVERY registry token SHALL be referenced by the stylesheet — a token that nothing consumes SHALL NOT be added. Image rules SHALL size `wg-img-avatar` from the `avatar-size` token (circular crop), `wg-img-thumb` from the `thumb-size` token (rounded rectangle), and render `wg-img-hero` as a block spanning available width; all three SHALL use `object-fit: cover` or equivalent so mis-proportioned sources stay presentable. The tree's node icons SHALL be sized to a shared em-box — `wg-tree-icon` (text) and `wg-img-icon` (image) to the SAME width — so an emoji and an image icon align on the same baseline. Tree rules SHALL style the branch disclosure rather than hide children by CSS: the `wg-tree-branch` summary SHALL suppress the platform's own marker on both engines and draw one token-colored chevron that turns in the `[open]` state, and the children list SHALL keep its indent and hairline; there SHALL be no rule hiding collapsed children, because collapsing is the disclosure's own semantics. `injectBaseStyles(doc)` SHALL append the stylesheet as a marked `<style>` element exactly once per document (idempotent).

#### Scenario: Stylesheet covers the built-in classes
- **WHEN** `baseStylesheet` is inspected
- **THEN** it SHALL contain rules for `.wg-card`, `.wg-table`, `.wg-tree`, `.wg-code`, `.wg-img`, `.wg-img-avatar`, `.wg-img-thumb`, and `.wg-img-hero`

#### Scenario: All variables come from the registry
- **WHEN** every `--wg-*` reference in `baseStylesheet` is extracted
- **THEN** each SHALL correspond to a token in `THEME_TOKENS`
- **AND** each `var()` reference SHALL include a fallback value

#### Scenario: Injection is idempotent
- **WHEN** `injectBaseStyles(document)` is called twice
- **THEN** the document SHALL contain exactly one widgentic style element

#### Scenario: Avatar size is themeable
- **WHEN** a theme sets `"avatar-size": "48px"` and is applied to a container with an `.wg-img-avatar` image
- **THEN** the avatar SHALL derive its rendered box from the overridden token value

#### Scenario: Surface falls back to bg
- **WHEN** the surface rules are inspected
- **THEN** `.wg-card` background SHALL be `var(--wg-surface, var(--wg-bg, …))`
- **AND** a theme setting only `bg` SHALL color surfaces with that `bg` value, unchanged from prior behavior
- **AND** this SHALL be verified by resolving the surface's computed background under such a theme, not by matching the stylesheet's text — a literal `:root` default for `surface` satisfies the text while breaking the behavior

#### Scenario: No token is decorative
- **WHEN** every `--wg-*` reference in `baseStylesheet` is collected and compared against `THEME_TOKENS`
- **THEN** the set of tokens referenced by nothing SHALL be empty

#### Scenario: Status utilities pair fill and text colors
- **WHEN** the stylesheet is inspected
- **THEN** `.wg-status-danger`, `.wg-status-success`, `.wg-status-warning`, `.wg-status-info`, and `.wg-status-accent` SHALL each set a background from their status token and a color from the matching `-fg` token

#### Scenario: Every token is defined for custom styles
- **WHEN** the stylesheet's leading `:root` block is inspected
- **THEN** it SHALL declare `--wg-<token>: <default>` for every token in `THEME_TOKENS`
- **AND** a custom widget style referencing a bare `var(--wg-spacing-lg)` under an applied theme that does not set `spacing-lg` SHALL resolve to the registry default rather than collapse
- **AND** a bare `var(--wg-surface)` SHALL likewise resolve, even though `surface` is defined as a chain through `bg`

#### Scenario: The tree's disclosure is styled, not worked around
- **WHEN** `baseStylesheet` is inspected
- **THEN** it SHALL carry no `data-expanded` selector
- **AND** the `wg-tree-branch` summary SHALL be `cursor: pointer` with the platform marker suppressed and one token-colored chevron that turns under `[open]`

#### Scenario: Node icons share one em-box
- **WHEN** the `.wg-tree-icon` and `.wg-img-icon` rules are compared
- **THEN** both SHALL declare the SAME em width, so a text icon and an image icon occupy the same slot

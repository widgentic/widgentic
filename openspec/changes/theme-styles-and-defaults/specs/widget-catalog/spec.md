## MODIFIED Requirements

### Requirement: Registered widget styles
`WidgetDescriptor` SHALL accept optional `styles`: a map of CSS selectors to property/value maps, letting custom kinds ship their look as data. Every selector part — split on top-level commas, so the commas inside `:is()`, `:not()`, `:has()` or `:where()` belong to their argument — SHALL name a `.wg-`-prefixed class in its own structure (a `.wg-` class only inside a pseudo-class argument or an attribute test does not count), and no part SHALL open with a combinator; selectors, property names, and values are guarded (no braces, semicolons, angle brackets, `@`, backslashes, comment markers `/*` or `*/`, and in values no `url(`, `expression(`, `image-set(` or `src(`), and values MAY reference theme tokens via `var(--wg-*)`. Invalid entries SHALL be skipped, never emitted. `widgetStylesToCss(styles)` SHALL generate the CSS, and styles SHALL be exposed through `describe`/`list` so hosts can inject them.

#### Scenario: Styles registered as data generate CSS
- **WHEN** a kind registers `styles: { ".wg-invoice": { border: "1px solid var(--wg-border, #e2e8f0)" } }`
- **THEN** `widgetStylesToCss` SHALL emit a `.wg-invoice { border: ... }` rule
- **AND** `describe(kind).styles` SHALL return the map

#### Scenario: Unsafe style entries are dropped
- **WHEN** styles contain a non-`.wg-` selector (e.g. `body`), a value with `url(`, or a property with `{`
- **THEN** the generated CSS SHALL contain none of them
- **AND** safe sibling entries SHALL still be emitted

#### Scenario: Structural tricks and URL carriers are dropped
- **WHEN** styles hold `html /* .wg-x */`, `body:not(.wg-x)`, `:is(.wg-a, body)`, `body[data-a=".wg-"]`, `.wg-a, ~ .wg-b`, a value `red /*`, and values calling `image-set(` or `src(`, beside a safe `.wg-row:has(.wg-ok, .wg-warn)` rule
- **THEN** the generated CSS SHALL contain only the safe rule

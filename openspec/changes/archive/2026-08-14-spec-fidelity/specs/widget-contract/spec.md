# widget-contract — the types resolve where the exports map says

## MODIFIED Requirements

### Requirement: TypeScript type exports
The package SHALL export TypeScript types `WidgetPayload`, `WidgetKind`, `WidgetHints`, and `WidgetMeta` describing the contract `{ kind, data, hints?, meta? }` from the `widgentic/contract` entry — the package's `exports` map is the single resolution authority, and it deliberately exposes named entries only (there is no `"."` root export).

#### Scenario: Import types from the package entry
- **WHEN** a consumer imports `WidgetPayload` from the package's contract entry (`widgentic/contract`, resolved through the `exports` map)
- **THEN** the type SHALL be available and resolve to a discriminated object containing at minimum `kind: string` and `data: unknown`

#### Scenario: Optional fields are typed optional
- **WHEN** a consumer constructs a `WidgetPayload` without `hints` or `meta`
- **THEN** the TypeScript compiler SHALL NOT raise an error

# widget-contract — package-split-readiness delta

## MODIFIED Requirements

### Requirement: TypeScript type exports
The `@widgentic/core` package SHALL export TypeScript types `WidgetPayload`, `WidgetKind`, `WidgetHints`, and `WidgetMeta` describing the contract `{ kind, data, hints?, meta? }` from both its root entry and the `@widgentic/core/contract` subpath — the package's `exports` map is the single resolution authority, and every documented entry SHALL be listed there.

#### Scenario: Import types from the package entry
- **WHEN** a consumer imports `WidgetPayload` from `@widgentic/core` or from `@widgentic/core/contract` (resolved through the `exports` map)
- **THEN** the type SHALL be available and resolve to a discriminated object containing at minimum `kind: string` and `data: unknown`

#### Scenario: Optional fields are typed optional
- **WHEN** a consumer constructs a `WidgetPayload` without `hints` or `meta`
- **THEN** the TypeScript compiler SHALL NOT raise an error

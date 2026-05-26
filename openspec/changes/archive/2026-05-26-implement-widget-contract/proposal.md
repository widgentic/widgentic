## Why

The `widget-contract` capability is defined behaviorally but has no implementation. Adapters, mapper, catalog, and MCP integration all depend on a shared, programmatic representation of the payload and a way to validate it. Shipping types + a validator first unblocks every downstream capability and lets us write tests against the contract directly.

## What Changes

- Add a TypeScript package skeleton (`src/contract/`) with strict TS config.
- Export typed primitives: `WidgetKind`, `WidgetPayload`, `WidgetHints`, `WidgetMeta`.
- Export `validateWidgetPayload(input)` returning a discriminated `{ ok: true, payload } | { ok: false, error }` result.
- Define a structured `WidgetContractError` shape (`code`, `message`, `path?`).
- Honor forward compatibility: unknown top-level fields are preserved and do not fail validation.
- Provide a `KIND_REGISTRY` injection point so the validator can consult a known-kinds list (default: empty; populated later by `widget-catalog`).
- Add unit tests covering all scenarios listed in the existing `widget-contract` spec plus the new validator requirements.

No breaking changes (no prior implementation).

## Capabilities

### New Capabilities
<!-- None. This change implements an existing capability. -->

### Modified Capabilities
- `widget-contract`: add requirements for a programmatic TypeScript surface (types + `validateWidgetPayload`) and a structured error shape. Existing behavioral requirements are unchanged.

## Impact

- New code: `src/contract/{index.ts,types.ts,validate.ts,errors.ts}` and tests under `src/contract/__tests__/`.
- New tooling: `package.json`, `tsconfig.json`, test runner config (Vitest).
- Downstream: enables follow-up changes for `data-adapters`, `widget-mapper`, `widget-catalog`, `mcp-widget-output` to import the contract directly.

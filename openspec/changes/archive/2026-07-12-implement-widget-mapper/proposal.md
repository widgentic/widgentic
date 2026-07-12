## Why

The `widget-mapper` capability is specified but not implemented. Agents frequently emit raw data without choosing a widget, and without the mapper every consumer (MCP tools, hosts) has to hand-pick `kind` for each payload. Implementing the shape-based default selection completes the adapter → mapper → contract pipeline and unblocks `widget-catalog` rendering work.

## What Changes

- Add `src/mapper/` exporting `inferKind(data)` (pure shape inference) and `mapToWidget(input)` (produces a complete, contract-valid `WidgetPayload`).
- Implement the spec's selection rules: non-empty array of consistent plain objects → `table`, nodes with `children` arrays (recursively) → `tree`, plain object → `card`, anything ambiguous → `card` fallback.
- Preserve an explicit `kind` when the input already provides one — the mapper never overrides agent intent.
- Make the mapper total: it never throws and never returns an error result; every input maps to some payload (fallback `card`).
- Preserve unknown top-level fields and pass `hints`/`meta` through untouched (forward compatibility, matching the contract).
- Export the mapper from a new package entry `./mapper`.
- Add Vitest coverage for every scenario in `openspec/specs/widget-mapper/spec.md` plus the new programmatic-surface requirements.

No breaking changes.

## Capabilities

### New Capabilities
<!-- None. This change implements an existing capability. -->

### Modified Capabilities
- `widget-mapper`: add requirements for the programmatic TypeScript surface (`inferKind`, `mapToWidget`), totality (no errors), passthrough of `hints`/`meta`/unknown fields, and tree/table precedence. Existing behavioral requirements are unchanged.

## Impact

- New code: `src/mapper/` with `index.ts`, implementation, and `__tests__/`.
- New package entry: `./mapper` in `package.json` `exports`.
- Depends on: `widgentic/contract` types (`WidgetPayload`, `WidgetKind`); no new runtime dependencies.
- Downstream: enables `widget-catalog` renderers and `mcp-widget-output` tools to accept raw data and emit valid payloads.

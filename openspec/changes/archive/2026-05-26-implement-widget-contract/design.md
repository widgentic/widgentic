## Context

`widget-contract` defines the payload `{ kind, data, hints?, meta? }` that flows between adapters, mapper, catalog, and MCP integration. With no implementation yet, downstream capabilities cannot be built or tested. This change ships the smallest useful surface: types + a runtime validator, with no external dependencies.

## Goals / Non-Goals

**Goals**
- Provide strict TypeScript types for the contract.
- Provide a runtime `validateWidgetPayload` with structured errors and an optional kind registry hook.
- Preserve forward-compatible unknown fields.
- Stand up the repo tooling (TS, Vitest) so subsequent changes can drop into the same setup.

**Non-Goals**
- No JSON Schema artifact in this change (can be generated later from types).
- No runtime check of `data` against per-kind shapes (that lives in `widget-catalog`).
- No DOM rendering, no async/streaming variant.
- No public hint vocabulary beyond a free-form `Record<string, unknown>`.

## Decisions

### Decision 1: Hand-rolled validator, no schema lib
A small custom validator (~50 LoC) avoids pulling Zod/Ajv into the foundational package. The contract surface is tiny, so the cost of dropping a dep is not justified yet.

### Decision 2: Discriminated result instead of throwing
`{ ok, payload | error }` keeps the API exception-free, easy to compose, and matches the renderer's "ignore unknown, surface structured errors" stance.

### Decision 3: Kind registry as injection, not import
The validator does not import the catalog (would create a circular dependency in later changes). Hosts/tests pass a `knownKinds` set explicitly; the default is "kind format only".

### Decision 4: Preserve unknown fields
The validator returns the original input as `payload` (typed with an index signature for unknown keys) rather than reconstructing a stripped object. Honors the forward-compatibility requirement and keeps the validator cheap.

### Decision 5: Tooling baseline
- Package manager: npm (no lockfile yet, simplest start).
- Test runner: Vitest (fast, zero-config with TS).
- TS: `strict: true`, ES2022, ESM module output.
- No bundler in this change — consumers import source for now; bundling lands when we publish.

## Risks / Open Questions

- **Risk**: future need for async/streaming payloads. Mitigation: keep validator synchronous and pure; a streaming variant can wrap it.
- **Open**: should `kind` be constrained to a regex (kebab-case)? Deferred — currently any non-empty string is allowed; catalog enforces real membership.
- **Open**: do we want a `safeParse`-style alias? Not in this change; one entry point is enough.

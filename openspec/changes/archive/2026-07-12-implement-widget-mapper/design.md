## Context

`widget-mapper` sits between data producers (adapters, agents, MCP tools) and the contract. Given data — typically the output of `parseJson`/`parseCsv` or an agent-built structure — it picks a default widget `kind` from the data's shape and produces a complete `WidgetPayload`. The behavioral rules are already specified in `openspec/specs/widget-mapper/spec.md`; this change defines and implements the programmatic surface.

Existing building blocks:
- `widgentic/contract` provides `WidgetPayload`, `WidgetKind`, and `validateWidgetPayload`.
- `widgentic/adapters` provides `parseJson`/`parseCsv` producing raw values/records.

## Goals / Non-Goals

**Goals:**
- Pure, synchronous, zero-dependency mapper in `src/mapper/`, exported as `./mapper`.
- `inferKind(data)` for callers that only want the decision; `mapToWidget(input)` for callers that want a full payload.
- Total behavior: every input maps to a payload; the mapper never throws and has no error result.
- Output that satisfies `validateWidgetPayload` whenever the input's optional fields already satisfy the contract.

**Non-Goals:**
- No data transformation. The mapper selects `kind`; it does not reshape `data` to fit a renderer's preferred structure (e.g., it does not convert an object into card `fields`).
- No hint-driven inference (e.g., `hints.preferredKind`). Explicit `kind` is the only override.
- No catalog integration or kind validation — `kind` is an open string per the contract; the catalog resolves it at render time.
- No confidence scores or multi-candidate suggestions.

## Decisions

### Decision 1: `mapToWidget` takes a partial payload, not bare data
Signature: `mapToWidget(input: MapperInput): WidgetPayload` where `MapperInput = { kind?: string; data: unknown; hints?; meta?; [key: string]: unknown }` — i.e., a `WidgetPayload` with `kind` optional. Callers wrap raw data as `mapToWidget({ data: raw })`.

*Alternative considered*: accept bare data and sniff whether the argument "looks like" a payload (has `kind`/`data` keys). Rejected — raw data can legitimately contain those keys, making behavior unpredictable. Requiring the `{ data }` envelope costs callers nine characters and removes all ambiguity. `inferKind(data: unknown)` covers the bare-data use case directly.

### Decision 2: The mapper is total
`mapToWidget` never throws and has no `{ ok, error }` result, unlike the validator and adapters. Rationale: those components answer "is this input acceptable?" where failure is meaningful; the mapper answers "what widget should this be?" where a safe answer (`card`) always exists. A non-string or empty `kind` on the input is treated as absent (inference runs) rather than an error — garbage-in should still render something.

### Decision 3: Inference precedence is tree → table → card
Checked in order:
1. **tree** — data is a plain object with an array-valued `children` property, or a non-empty array in which every element is such an object.
2. **table** — data is a non-empty array in which every element is a plain object, and the elements have consistent keys (Decision 4).
3. **card** — data is a plain object (no array `children`).
4. **card** (fallback) — everything else: primitives, `null`/`undefined`, empty arrays, arrays of primitives or mixed types, arrays of arrays.

Tree must precede table because tree nodes are themselves records — an array of `{ label, children }` objects satisfies the table rule too. Detection inspects only the top level: a nested tree's root node necessarily carries `children`, so recursing into the structure adds cost without changing the answer (the spec's "(recursively)" describes the data shape, which the tree renderer handles).

### Decision 4: "Consistent keys" means a non-empty shared key intersection
A records array maps to `table` when all elements are plain objects and either the array has one element or the intersection of all elements' key sets is non-empty. This tolerates optional fields (`[{id, name}, {id}]` → table) while pushing genuinely heterogeneous arrays (`[{a}, {b}]`) to the `card` fallback.

*Alternative considered*: require identical key sets — too strict; real API responses omit optional fields. *Alternative*: any array of plain objects — too loose; makes the spec's "consistent keys" wording meaningless. When the heuristic guesses wrong, the agent sets `kind` explicitly.

### Decision 5: Passthrough and non-mutation
`mapToWidget` returns a new top-level object: input fields (including unknown ones) are spread, and `kind` is filled in. `data`, `hints`, and `meta` are passed by reference, not cloned — the mapper is a hot path and the contract already treats payloads as immutable-by-convention. The input object is never mutated.

### Decision 6: Same plain-object definition as the contract
"Plain object" = `typeof v === "object" && v !== null && !Array.isArray(v)`, matching `validateWidgetPayload`. `Date`, `Map`, etc. therefore classify as objects → card. Consistency with the contract beats prototype-chain sophistication; renderers already have to cope with such values.

## Risks / Trade-offs

- [Records with a legitimate `children` array column misclassify as tree] → explicit `kind` overrides; precedence is documented in the spec so behavior is predictable.
- [Shared-key heuristic sends some valid record arrays to card] → explicit `kind` overrides; heuristic chosen to be predictable and spec-documented rather than clever.
- [Passthrough means garbage `hints`/`meta` (e.g., a number) flows into the output] → validation is the contract's job; mapper output validates whenever input's optional fields do. Documented in the spec as a passthrough guarantee, not a validity guarantee.
- [Key-intersection scan is O(rows × keys) on large arrays] → single pass with early exit when the intersection empties; no recursion into `data`.

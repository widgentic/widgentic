## Context

widgentic is a greenfield project. The repo currently contains only OpenSpec scaffolding and reference links. Agents calling MCP tools and external APIs need a consistent way to render structured data (JSON, CSV, ad-hoc trees) as UI without each tool inventing its own widgets. This change establishes the foundation: contract, catalog, adapters, mapper, and MCP integration convention.

## Goals / Non-Goals

**Goals**
- Define a small, stable widget payload contract usable from any agent or MCP tool.
- Pick a minimum widget set (`card`, `table`, `tree`, `custom`) that covers the common shapes returned by APIs.
- Make widget selection automatic from data shape, with explicit override.
- Keep the runtime light and embeddable in agent host UIs.
- Keep MCP integration a convention, not a hard dependency, so widgentic also works outside MCP.

**Non-Goals**
- No charts, maps, forms, or rich editors in this change.
- No styling/theming system beyond minimal density/density hints.
- No persistence, state management, or networking layer.
- No specific MCP host implementation; we define the convention only.

## Decisions

### Decision 1: Payload contract shape

`{ kind, data, hints?, meta? }` with forward-compatible unknown-field tolerance.

- `kind`: string identifier resolved against the widget catalog.
- `data`: widget-kind-specific body.
- `hints`: optional rendering guidance (columns, expandDepth, density).
- `meta`: optional title/source/timestamps for host chrome.

Rationale: small surface, easy to emit from any language an MCP tool runs in (JSON only), explicit override channel without polluting `data`.

### Decision 2: Built-in widget set

`card`, `table`, `tree`, `custom`. Rationale: these cover ~90% of API/agent outputs (single record, list of records, nested hierarchy, escape hatch). Anything more specific (charts, timelines, kanban) is delivered via `custom` registration in later changes.

### Decision 3: Mapper rules over schemas

Default kind is inferred from runtime shape (object/array/nested) rather than from a JSON Schema. Rationale: agents rarely ship schemas; shape inference is good enough for defaults and `kind` override is always available.

### Decision 4: Renderer-agnostic core

The contract, catalog, adapters, and mapper are pure data; only the rendering layer is DOM-bound. Rationale: keeps the package usable in test, server, and alternate UI runtimes; lets us pick a lightweight reactive layer (Arrow JS direction) later without changing the contract.

### Decision 5: MCP integration as a convention

We define how tools emit widget payloads and how hosts advertise capability, but we don't bind to one MCP SDK in this foundational change. Rationale: MCP ecosystem is evolving (Azure Functions MCP extension, fluent MCP SDK); a convention layer lets us adopt SDKs incrementally without rewriting specs.

## Risks / Open Questions

- **Schema drift**: as widgets gain options, `hints` may sprawl. Mitigation: per-widget hint schemas live next to each widget.
- **Custom widget security**: hosts registering arbitrary renderers can mis-render or leak. Mitigation: registration API will require an explicit allow-list in later changes.
- **CSV edge cases**: tabs, BOMs, ragged rows. Defer hardening to the data-adapters implementation change.
- **Open**: do we need a streaming variant of the contract for long-running tool output? Defer to a follow-up change.

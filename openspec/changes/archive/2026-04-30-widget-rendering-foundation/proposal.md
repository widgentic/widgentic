## Why

Agents that call MCP tools and external APIs return raw structured data (JSON, CSV, ad-hoc trees) that is hard to present consistently in chat or canvas surfaces. widgentic provides a single, agent-friendly UI layer that turns those structures into generic, composable widgets (cards, tables, trees, custom), so any MCP skill or plugin can render rich output without inventing its own UI.

## What Changes

- Establish widgentic as a generic widget rendering layer for agent tools (MCP skills/plugins).
- Define a normalized **widget data contract** that agents emit (data + optional hints/schema) and the renderer consumes.
- Introduce a **widget catalog** with a minimum viable set: `card`, `table`, `tree`, and an extensible `custom` slot.
- Define an **automatic mapper** that picks a default widget from data shape (object → card, array of records → table, nested → tree) with explicit override via hints.
- Specify **input adapters** for JSON and CSV so agents can pass either raw strings or parsed structures.
- Define an **MCP integration surface** describing how an MCP tool returns a widget payload that any compatible host can render.
- Set the **runtime baseline**: lightweight reactive rendering (Arrow JS direction) with no heavy framework lock-in.

This is a foundational change: no breaking changes (no prior product surface).

## Capabilities

### New Capabilities
- `widget-contract`: Normalized payload schema agents emit and renderers consume (data, hints, metadata, widget kind).
- `widget-catalog`: Built-in widget kinds (`card`, `table`, `tree`, `custom`) and registration model for extensions.
- `data-adapters`: JSON and CSV input adapters that produce the normalized contract.
- `widget-mapper`: Rules for selecting a default widget from data shape, with hint overrides.
- `mcp-widget-output`: Convention for returning widget payloads from MCP tools so hosts can render them.

### Modified Capabilities
<!-- None. Greenfield project. -->

## Impact

- New code areas (to be created in later changes): `src/contract/`, `src/widgets/{card,table,tree,custom}/`, `src/adapters/{json,csv}/`, `src/mapper/`, `src/mcp/`.
- `README.md`: expanded to describe widgentic's purpose and architecture.
- `openspec/config.yaml`: add project context (tech stack, conventions) referenced by future artifacts.
- External dependencies considered (not yet adopted): Arrow JS for reactive rendering; Azure Functions MCP extension and fluent MCP API as reference integration patterns (see `reference-links.md`).
- Downstream: future changes will deliver each capability's implementation, tests, and examples.

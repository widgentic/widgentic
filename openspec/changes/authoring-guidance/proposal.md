# Authoring Guidance: Agents Draft, Users Publish

## Why

Agents cannot register widgets or themes over MCP — deliberately (widget-store D5: the pasted key travels into prompt-injectable hosts). But the intended division of labor is real and currently unsupported: an agent should be able to *draft* a correct `CustomWidget` or theme-entry JSON for its user, who then imports it into the web designer, reviews it, and saves it through their authenticated session. Today an agent can list widgets, themes, and tokens — but the authoring rules (template DSL forms, safety constraints, identifier charset, styles guards, schema subset, limits, entry shapes) live only in specs and validators the agent cannot see. Agents guess, users get import errors.

Separately, the widget designer still carries a "Preview kind" selector from before the standalone theme designer existed — previewing built-in kinds belongs there now — and style authoring lacks a view of the selected theme's tokens, forcing users to remember `--wg-*` names.

## What Changes

- **New MCP tool `get_authoring_guide`** (read-only, like every widgentic tool): returns the complete authoring contract as structured JSON **derived from the live sources of truth** — entry shapes (`CustomWidget`, theme entry), the template DSL's node forms and safety rules, the identifier charset and the reserved built-in kinds (read from the catalog), the styles guards, the `dataSchema` subset with its pattern bounds, the token registry with types and uses, per-principal limits, and the workflow statement: *build the JSON, hand it to your user, they import/validate/save at widgentic.dev; registration is not available over MCP by design.*
- **Widget designer preview cleanup**: the "Preview kind" selector is removed — the widget designer's preview renders the draft, full stop (the theme designer owns previewing arbitrary kinds).
- **Token reference panel**: a compact, read-only listing of the selected preview theme's tokens (name, effective value, color swatch where applicable) beside the styles/theme area, so authors can reference `var(--wg-…)` while writing styles without leaving the designer.

## Capabilities

### Modified Capabilities

- `mcp-server`: gains the authoring-guide tool requirement.
- `widget-designer`: the preview-theme requirement drops the kind selector and gains the token reference listing.

## Impact

- `src/mcp-server/`: `handleGetAuthoringGuide()` (pure, SDK-free, in the base entry) + tool definition; registered in the assembly (`server.ts`); guide content assembled from `TOKEN_SPECS`, `DEFAULT_LIMITS`, the live catalog's kinds, and the validator constants — not hand-written prose that can drift.
- `src/designer/`: `theme-panel.ts` loses the kind select; gains the token listing; `preview.ts` drops the non-draft render path; `shell.ts` context shrinks.
- Tests: guide-derivation assertions (kinds/limits/tokens match their sources), an agent-simulation round trip (a widget built strictly from the guide passes designer import), tools/list shape update, designer panel tests.
- Docs: README/TESTING tool lists; the tool count becomes five.
- Ship as `v16`.

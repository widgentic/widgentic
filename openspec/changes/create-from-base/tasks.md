# Tasks — Create from base

## 1. Library: seeding helpers and starters

- [x] 1.1 `src/designer/seed.ts`: `seedWidgetDraft(source, taken?)` — stored definition copy with distinct kind (template/descriptor/styles/dataSchemaRef preserved) or built-in kind name → starter draft; `seedThemeEntry(source, taken?)` — entry or `light`/`dark` preset → tokens copied under a distinct non-reserved name; deterministic `-copy`/`-copyN` suffixing against the taken set
- [x] 1.2 Starter templates for `card`, `table`, `tree`: built-in `wg-*` classes, fixed bindings from each built-in's `dataExample`, valid dataSchema; each starter validates and renders through the preview pipeline
- [x] 1.3 Export both helpers (and starter access) from `widgentic/designer`
- [x] 1.4 Tests: stored-widget seed (identity distinct, ref preserved, source untouched), all three starters render with their classes, theme seed from preset + stored entry (reserved names refused), collision suffixing deterministic

## 2. App: Use as base and starters

- [x] 2.1 Widget rows and theme rows gain `Use as base` → NEW mode seeded via the helpers (taken = loaded lists); source stays untouched; existing Save-to-catalog path creates the entry
- [x] 2.2 `New` menus: widgets offer blank/card/table/tree, themes offer blank/light/dark
- [x] 2.3 App tests: seeded widget flow end-to-end (use-as-base → save → two entries), theme seed naming, built-in starter open

## 3. Verify and ship

- [x] 3.1 Full gate; strict validation
- [x] 3.2 Rig: browser check on :3002 (dev login) — use-as-base both tabs, starter menus, save creates a second entry; visual seed fidelity vs the built-ins
- [x] 3.3 Deploy v37 per the redeploy contract; verify live; README touch if the app section lists flows
- [x] 3.4 Commit, push, memory update

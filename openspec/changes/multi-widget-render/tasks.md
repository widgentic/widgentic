# Tasks — Multi-widget single render

## 1. Catalog: the group kind

- [x] 1.1 `renderGroup` layout container: `wg-group` + preset classes from hints (`wg-group-row`/`wg-group-grid`, `wg-gap-*`, column class clamped 1–4); items appended in order
- [x] 1.2 Dispatch recursion in `render()`: validate group envelope (items array of plain objects with string `kind`, cap 20, no nested groups) → re-enter per item → prefix failure paths with `data.items[<i>]`
- [x] 1.3 Group descriptor: dataShape documenting `items`, hints metadata for `layout`/`gap`/`columns`; registered as the fifth built-in
- [x] 1.4 Base stylesheet: `wg-group*` class rules (stack/row/grid + gaps), no new tokens
- [x] 1.5 Tests: mixed-kind composition, layout/gap/columns classes, unknown-layout fallback + diagnostic, indexed error paths, nested-group refusal, cap refusal, custom-template item renders with its budget

## 2. MCP server: output assembly and steering

- [x] 2.1 CSS union for group renders: `[group, ...distinct item kinds]` first-appearance order, each block once
- [x] 2.2 Per-item hint analysis with `data.items[<i>].hints.` prefixed paths, merged into the existing diagnostics channels
- [x] 2.3 `render_widget` description: one steering sentence — several widgets at once → one `group` render
- [x] 2.4 Tests: group of card + stored custom kind renders in one result (both markups, both style blocks once), diagnostics prefixing, steering text pinned

## 3. Verify and ship

- [x] 3.1 Full gate; strict validation
- [x] 3.2 Rig: render a 5-card group and a mixed card+table+custom group through mcp:http; check layouts and one-iframe behavior on the Apps host
- [x] 3.3 Deploy vNext per the redeploy contract; verify live (list_widgets shows group, steering on tool description, live group render)
- [x] 3.4 Commit, push, memory update

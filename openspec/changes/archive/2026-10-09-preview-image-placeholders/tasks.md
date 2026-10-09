## 1. Bridge

- [x] 1.1 `app-template.ts`: a preview image decision mirroring `resolveImage` (design D1) and a placeholder span builder (D2); tree icons, card fields and table cells use them.
- [x] 1.2 Server previews: replace non-`data:` `img` nodes with placeholders before mounting (D3).
- [x] 1.3 Trailing-URL rule on partial snapshots, applied before client builds and server requests (D4).
- [x] 1.4 Stylesheet: placeholder box, 16:9 pending hero; update the preview comments that said previews never emit images.

## 2. Tests

- [x] 2.1 One test per scenario of "Previews hold image places", through the `bootTemplate()` harness.
- [x] 2.2 Agreement test: core renders and bridge previews agree on image positions and shape classes across hint combinations.
- [x] 2.3 Template size budget still holds; the template probe still passes in headless Chrome.

## 3. Docs and gate

- [x] 3.1 `BACKLOG.md`: the fetch-cap item with the memory/latency analysis.
- [x] 3.2 Changeset (`@widgentic/mcp` patch); `TESTING.md` entry; inline-rendering doc if it describes preview images.
- [x] 3.3 Gate: typecheck, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict preview-image-placeholders`, `openspec validate --specs`, `npm run docs:check`.

## 1. Core

- [x] 1.1 Export `LABEL_STYLE_RULE` from `catalog/descriptors.ts` (and the core root), with the text in design D3. Add a `labels` hint to the `card` and `table` descriptors whose text documents `Record<key, string>` and includes the rule, and mention labels in the card's `dataShape` next to `fieldFormat`. Update the `tools/exports.test.ts` snapshots.
- [x] 1.2 `card.ts` and `table.ts`: show the label for a key with a non-empty string label, and the key otherwise, in `wg-card-field-key` and `wg-table-header` (the columns `hints.columns` selects included). Leave every other hint keyed by data.
- [x] 1.3 `images.ts`: `imageNode` takes the display label for `alt`, and the card and table pass the label when one is given.
- [x] 1.4 `hints.ts`: add a `labels` branch to `analyzeHints` (design D6).
- [x] 1.5 Tests for every widget-catalog scenario in the change, including byte-identical output without `labels`, escaping, the `hints.columns` order, `alt`, and the descriptors carrying the rule.

## 2. MCP server

- [x] 2.1 `render_widget`'s description: ask for `widget` first and any `hints` before `data` (design D5).
- [x] 2.2 The authoring guide (`guide.ts`) carries `LABEL_STYLE_RULE`, for template literals and the built-ins' `labels`.
- [x] 2.3 App template: `previewCard` and `previewTable` apply `hints.labels` the way the core renderers do. Their image places need no `alt`.
- [x] 2.4 Tests:
  - a streamed table and a card preview their labels (`bootTemplate()` harness);
  - the description's argument order;
  - the guide carries the rule verbatim.
- [x] 2.5 Add a labelled card and table to `tools/conformance-generate.ts` (render, page, preview), and regenerate the corpus. Existing cases change only where the new texts appear: `list_widgets` (the descriptors' `labels` hint), `get_authoring_guide` (the rule) and the app template (the previews' label lookup).

## 3. WebMCP

- [x] 3.1 `packages/webmcp/src/guide.ts` carries `LABEL_STYLE_RULE`, mirroring the server guide, with a test that it appears verbatim.

## 4. Docs and release notes

- [x] 4.1 Document `labels`:
  - `docs/design/groups-and-hints.mdx`: the hint, with a card and a table example in Title Case;
  - `docs/how-it-works/payload-contract.mdx`: labels are presentation, and keys stay data;
  - the README's hint mentions, if any list them.
- [x] 4.2 Add changesets for core (minor), mcp (minor) and webmcp (patch).
- [x] 4.3 Add a dated `TESTING.md` verification-log entry.

## 5. Gates

- [x] 5.1 Run typecheck, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict field-labels` and `--specs`. Then run `cd dotnet && dotnet test --solution Widgentic.slnx -c Release`, since the corpus and the bundle change.

## 6. Staging

- [ ] 6.1 Build and deploy the branch image to staging. Verify from the served bytes that a labelled card and table render their labels and that `list_widgets` carries the rule.
- [ ] 6.2 Owner check in a new conversation on claude.ai and one more host: ask for a card and a table with multi-word fields without naming a style, and expect Title Case labels with snake_case keys in the payload. Then ask for lower-case labels, and expect the agent to follow the request.

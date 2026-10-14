## 1. Core

- [x] 1.1 `card.ts`: apply `hints.fields` per D1. The listed keys render in order; missing keys are skipped and repeats render once. A malformed value falls back to data order, and a card without `fields` stays byte-identical. Update the module header.
- [x] 1.2 `hints.ts`: report `fields` entries that match no card field (`NO_MATCH`) and a value that is not an array of strings (`INVALID_VALUE`).
- [x] 1.3 `descriptors.ts`: export `FIELD_ORDER_RULE` (D3), and add a `fields` hint to the card descriptor and the rule to the table's `columns` hint. Mention `hints.fields` in the card's `dataShape`. Update the exports snapshot.
- [x] 1.4 Tests for every scenario of "Card field order and selection" and the new hint-analysis scenario. Existing card tests must pass unchanged.

## 2. Previews and the corpus

- [x] 2.1 `app-template.ts` `previewCard`: apply `fields` like the renderer (D4).
- [x] 2.2 A `bootTemplate()` harness test for "A streamed card previews in the hinted order", including the partial step with only `company` received.
- [x] 2.3 `tools/conformance-generate.ts`: card cases ordering and selecting fields, with a missing key, as a render, a page and a preview. Regenerate the corpus; the bare realm and .NET must reproduce it.

## 3. Docs and release notes

- [x] 3.1 Regenerate the docs Reference pages.
- [x] 3.2 Changesets: core and mcp minor (D5). Add a dated `TESTING.md` entry.

## 4. Gates and staging

- [x] 4.1 Run the gates: typecheck, `npm test`, build, `pack:check`, docs check, `openspec validate --strict card-field-order` and `--specs`, and `dotnet test`.
- [ ] 4.2 Deploy the branch to staging. Check from the served bytes that `list_widgets` carries the `fields` hint with the rule, and that a card with `fields` renders in the hinted order. Hand the owner a host probe prompt.

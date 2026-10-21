## 1. The rule (`@widgentic/core`)

- [x] 1.1 `packages/core/src/contract/url-values.ts`: `composePrefixedUrl(prefix, value)` with the three cases of D1, runtime-neutral (a code-point loop, no `URL` global). It is internal, imported by the template compiler and the built-in link composer.
- [x] 1.2 `compile.ts`: the `prefix` transform composes through it. `widgets/format.ts` `linkOrText`: a string link hint composes through it. Empty values still emit nothing, and the URL guard still runs on the composed value. The `hints.links` analyzer (`catalog/hints.ts`) composes the same way, so its `UNSAFE_LINK_TARGET` check reads the href the renderer builds.
- [x] 1.3 Tests:
  - every new scenario of "Template node forms and interpretation", "Card data handling" and "Table data handling";
  - the existing `mailto:` scenario unchanged;
  - a unit table over the three cases: a query prefix, `mailto:`, `tel:`, `sms:`, `https:` with and without `%`, non-ASCII, astral characters, an empty value.

## 2. The bridge and steering (`@widgentic/mcp`, `@widgentic/webmcp`)

- [x] 2.1 `app-template.ts` `cellNode`: the same three cases in compact bridge JS, within the size budget. If it does not fit, record the budget change.
- [x] 2.2 An agreement test in `packages/mcp/src/server/__tests__`. It drives the core renderer and the bridge preview (`bootTemplate()` harness, streamed card and table) over the same prefixes and values, and requires identical `href`s. It also covers the new "Previews compose links as the result does" scenario.
- [x] 2.3 Steering (D3):
  - the `ATTR PREFIX` line in `packages/mcp/src/server/guide.ts` and `packages/webmcp/src/guide.ts`;
  - the card and table `links` descriptor texts;
  - the designer's prefix field title.

  Regenerate the conformance corpus, adding prefix cases (a query-prefixed image `src`, a `mailto:` value with `?`, a bare `https:` remainder, a `hints.links` query prefix).

## 3. Docs and release notes

- [x] 3.1 `docs/design/template-dsl.mdx` (the `prefix` paragraph, the three cases) and `docs/design/groups-and-hints.mdx` (`hints.links`). Regenerate the reference pages.
- [x] 3.2 Changesets: `@widgentic/core`, `@widgentic/mcp`, `@widgentic/webmcp` and `@widgentic/designer` (its prefix field title) patch. Add a dated `TESTING.md` entry with the production scan counts.

## 4. Gates and staging

- [x] 4.1 Run the gates: typecheck, `npm test`, build, `pack:check`, the docs check, `openspec validate --strict encode-prefixed-url-values` and `--specs`. Also run `dotnet test`, because the host bundle renders the changed code.
- [ ] 4.2 Deploy the branch to staging and check from the served bytes:
  - a keyed `render_widget` of a template with a query-prefixed image `src` carries the encoded URL in the tree and in the `page` document;
  - the seeded `mailto:`/`tel:` links are unchanged.

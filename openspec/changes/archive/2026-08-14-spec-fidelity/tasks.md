# Tasks — Spec Fidelity

## 1. Code behavior fixes

- [x] 1.1 `src/catalog/registry.ts`: renderer call wrapped → `RENDER_FAILED` structured error naming the kind + thrown message (`ErrorCode` union extended); throwing-renderer test added
- [x] 1.2 `.wg-img-hero` gains `width: 100%` (test asserts both width and max-width); `darkTheme` surface≠bg assertion added
- [x] 1.3 `INVALID_IDENTIFIER` in `src/store/validate.ts` for `kind`/`name` outside the file store's `^[a-zA-Z0-9._-]+$` charset; tests: memory write refusal (`a/b#c`, `no?slash`), composition skip with diagnostic (`sneaky/one`)
- [x] 1.4 `WIDGENTIC_INLINE_IMAGES` read per construction; disable-path test proves no fetch is attempted and original URLs survive

## 2. Test infrastructure

- [x] 2.1 `vitest.config.ts`: `typecheck.enabled: true` — type tests run in the default `npm test`; verify all `*.test-d.ts` suites execute and stay green; `test:types` kept as the focused runner
- [x] 2.2 Rewrite `src/mcp-server/__tests__/sdk-interop.test.ts` against `createWidgenticServer` (4 tools incl. `list_themes`; keep the string-marshalling round-trips; tools/list asserts the real assembly shape)

## 3. Tests for implemented-but-unverified scenarios

- [x] 3.1 server-wiring: tools/list carries `_meta.ui.resourceUri` on `render_widget`
- [x] 3.2 app-template: host-context test — initialize result + `host-context-changed` apply theme (`data-theme`), style variables, safe-area padding; widgentic theme overrides host vars; plus a no-`http(s)://`-references assertion on `buildAppTemplate()` output
- [x] 3.3 inline-images: redirect hop landing on a private address is refused
- [x] 3.4 store: oversized entry (bytes) and over-budget template (nodes) skipped at **composition** with diagnostics
- [x] 3.5 handlers: page-format text carries no `Hint notes:` tail while `structuredContent.diagnostics` still reports
- [x] 3.6 adapters: CSV ragged row with **fewer** fields; JSON parse-position asserted per the corrected scenario wording
- [x] 3.7 contract-suite fidelity: remove-leaves-siblings-intact; `listKeys` added to the read-only type proof; rotation exercised with three keys per the spec scenario
- [x] 3.8 contract: package-exports resolution test for `widgentic/contract` (parity with mapper/catalog)

## 4. Docs and polish

- [x] 4.1 `apps/web/auth.ts` docblock: GitHub is a first-party OAuth flow (D4 revised), not federated
- [x] 4.2 `src/adapters/errors.ts`: `line` documented as best-effort record/line number (quoted newlines diverge from physical lines)
- [x] 4.3 `examples/mcp-server/main.ts` stderr line lists all four tools incl. `list_themes`

## 5. Verify and ship

- [x] 5.1 Full `npm test` (now incl. type suites) + typecheck green; change validates strict
- [x] 5.2 Build v15, deploy with the standing parameter set (domain arrays + live secrets recovered per the redeploy contract); smoke: bootstrap/anonymous catalog matrix unchanged, `render_widget` normal path unchanged
- [x] 5.3 TESTING.md/README touch-ups if any wording drifted; memory update

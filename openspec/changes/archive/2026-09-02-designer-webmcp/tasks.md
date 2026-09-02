## 1. Package scaffold

- [x] 1.1 `packages/webmcp/package.json`: name `@widgentic/webmcp`, version `0.1.0`, description stating BETA, `type: module`, `exports` `.` (types + default → dist), `files`, `sideEffects: false`, `engines.node >=22`, `repository.directory`, `publishConfig` (public, provenance), `dependencies` exactly `@widgentic/core` and `@widgentic/designer` at `^0.7.0`; `tsconfig.build.json` (rootDir `src`, outDir `dist`, excludes `__tests__`); copy `LICENSE`; `scripts.build`/`clean` like designer (no browser bundle).
- [x] 1.2 Root wiring: `tsconfig.json` paths (`@widgentic/webmcp` → `packages/webmcp/src/index.ts`), `vitest.config.ts` alias + `webmcp` project, root `build` script (core → designer → webmcp → mcp), `tools/pack-check.mjs` PACKAGES, `tools/exports.test.ts` entry.
- [x] 1.3 `tools/boundaries.test.ts`: PACKAGES + `webmcp`, `ALLOWED_EDGES.webmcp = ["core","designer"]`, `BROWSER_SAFE` adds webmcp, `EXTERNALS.webmcp = []`, honest-deps assertion becomes a per-package expected map (designer/mcp → core only; webmcp → core + designer; no peers on webmcp).
- [x] 1.4 `.changeset/designer-webmcp.md`: minor for `@widgentic/webmcp` (first publish); `.changeset/config.json` unchanged (webmcp NOT linked — design D9).

## 2. Tool layer (`packages/webmcp/src`)

- [x] 2.1 `types.ts`: `WebMcpTool { name, title?, description, inputSchema, annotations?, execute(input, options?) }`, `WebMcpToolResult { content: [{ type: "text", text }] }`, `ModelContextLike`, `DesignerSources`, `ExposeOptions`, `ExposeResult`; `result.ts` — `okResult(payload)`, `failResult(code, detail)` with codes `NOT_MOUNTED | INVALID_INPUT | REJECTED` (design D4).
- [x] 2.2 `widget-tools.ts`: `widget_draft_get` (export shape + diagnostics; cache via `subscribe` in a `WeakMap`, `deriveDiagnostics` fallback flagged `derived: true` — design D3), `widget_draft_load` (`loadWidget`, relay errors, return new diagnostics), `widget_example_data_set` (`descriptor.dataExample` — design D6), `widget_theme_set` (`loadTheme`). Descriptions state shapes, the diagnostics returned, "the person reviews and saves".
- [x] 2.3 `entry-tools.ts`: theme/schema/action `get` + `load`; `theme_tokens_set` (merge + `remove`, load merged entry, unchanged on refusal); `reference-tools.ts`: `theme_token_specs` derived from `TOKEN_SPECS` at call time.
- [x] 2.4 `tools.ts`: `designerTools(sources, { prefix = "widgentic" })` — pure, only tools for supplied sources plus the reference tool; every `inputSchema` `additionalProperties: false`; `readOnlyHint` on every `*_get` and the specs tool; `title` set for the address-bar list (design D5).
- [x] 2.5 `register.ts`: `resolveModelContext()` (document → navigator, explicit option wins — design D7), `registerTools(tools, { modelContext?, signal? })` with `Promise.allSettled`, per-name failure report, `dispose()` = abort + `unregisterTool` when present, idempotent (design D8); `exposeDesigners(sources, options)` = `designerTools` + `registerTools`, accepting extra host tools (`options.tools`).
- [x] 2.6 `index.ts` barrel + module header; `README.md` (beta banner, one-call usage after mount, the twelve tools, result shape, browsers verified + date, "agents edit, people save", Chrome flag recipe pointer).

## 3. Tests (`packages/webmcp/src/__tests__`, happy-dom, content-asserting)

- [x] 3.1 `tools.test.ts`: only supplied sources produce tools; prefix default/custom; read-only annotations; closed input schemas; no tool name contains save/publish/delete.
- [x] 3.2 `widget-tools.test.ts` over a REAL `createDesigner`: draft_get carries kind/template/descriptor + `previewable`; draft_load applies and notifies subscribers; invalid template refused with the designer's error strings and unchanged draft; example_data_set writes `descriptor.dataExample` and reports the example-vs-schema verdict; theme_set validates (`accent` accepted, unknown token refused, theme unchanged).
- [x] 3.3 `entry-tools.test.ts` over real theme/schema/action designers: theme round-trip; tokens merge + remove exactness; empty schema name refused; action entry loads; `theme_token_specs` lists every `TOKEN_SPECS` key with name/type/default/use and `surface.fallback === "bg"`.
- [x] 3.4 `results.test.ts`: NOT_MOUNTED when a getter returns undefined; INVALID_INPUT names the argument; every result is `content[0].type === "text"` with parseable JSON; nothing rejects.
- [x] 3.5 `register.test.ts` with a fake `ModelContextLike`: unsupported → `supported: false`, nothing thrown; each descriptor registered once with a signal; document beats navigator; one rejection does not stop the rest and is reported by name/message; dispose aborts + unregisters + is idempotent; a host-supplied extra tool registers under the same signal.
- [x] 3.6 Boundaries/exports: `tools/exports.test.ts` snapshot gains the `@widgentic/webmcp` block; boundaries test green with the new edge.

## 4. Example hosts

- [x] 4.1 `examples/shared/webmcp.ts`: `designerSources({ show, current })` — getters that open a section and return the live handle (design D2, D11); `examples/shared/package.json` adds `@widgentic/webmcp`.
- [x] 4.2 `examples/docker/main.ts`: one `exposeDesigners` call after boot with the shared sources; status line in `index.html` ("agent tools: N registered" / "no agent-capable browser"); `package.json` adds `@widgentic/webmcp ^0.1.0`; Dockerfile import smoke adds `import('@widgentic/webmcp')`.
- [x] 4.3 `examples/docker/web.ts`: optional `/mcp` reverse proxy when `WIDGENTIC_MCP_UPSTREAM` is set — method, headers, body and streamed response piped via `http.request`, no auth added, 404 when unset (design D13); optional `<meta http-equiv="origin-trial">` injected from `WIDGENTIC_ORIGIN_TRIAL_TOKEN` (design D14); compose comments document both variables.
- [x] 4.4 Tests for 4.3 in `examples/docker/__tests__`: proxy forwards an `initialize` POST with `x-api-key` to a stub upstream and streams the response; unset variable → 404; the token appears in the served page only when set.
- [x] 4.5 `examples/designer/main.ts`: the same `exposeDesigners` call with the shared sources and status line; `package.json` adds `@widgentic/webmcp`. No static build (scope cut).
- [x] 4.6 `examples/docker/README.md`: the co-author loop (open in ChatGPT Desktop's browser or flagged Chrome → agent drafts → you save → the agent renders it over `/mcp`), the two new variables, the single-origin deployment note and the ephemeral-instance caveat; the polyfill hook sentence (design D12).

## 5. Docs and verification

- [x] 5.1 Root `README.md`: capability row `designer-webmcp` → `@widgentic/webmcp`, package table row (browser, beta), layout block in `CLAUDE.md` (`packages/webmcp`) and the boundaries paragraph (edge webmcp → core, designer).
- [x] 5.2 `TESTING.md`: entries table (+ webmcp), "WebMCP: real-Chrome check" recipe (`--enable-features=WebMCPTesting,DevToolsWebMCPSupport`, `navigator.modelContextTesting.getTools()` / `executeTool()` against `npm run designer`; ChatGPT Desktop "Available site tools" check), dated verification-log entry.
- [x] 5.3 `docs/`: package reference page for `@widgentic/webmcp` if `tools/docs-generate.ts` enumerates packages; `npm run docs:check` green.
- [x] 5.4 Run the real-Chrome recipe once on this VM (Chrome 151, headless, chrome-devtools or a script) against `npm run designer`: list tools, execute `widgentic_widget_draft_load` with the invoice seed, observe the mounted designer change; record the result in the verification log honestly (what was VISIBLE).
- [x] 5.5 `docs/`: a hand-written page "Co-author with a browser agent (WebMCP)" — what it is, the one call, the twelve tools, browsers verified, the polyfill hook; nav entry; `npm run docs:check` green.

## 6. Gate

- [x] 6.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` green.
- [x] 6.2 `openspec validate --strict designer-webmcp` and `openspec validate --specs` green.
- [x] 6.3 Commit and push at archive (one commit for the change); the push to `main` makes the release workflow open the Version Packages PR that publishes `@widgentic/webmcp@0.1.0` on merge.

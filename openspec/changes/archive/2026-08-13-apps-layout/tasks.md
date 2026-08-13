# Tasks — Apps Layout

## 1. Promote the app template into the library

- [x] 1.1 `git mv examples/mcp-server/app-template.ts src/mcp-server/app-template.ts`; export `buildAppTemplate` from `src/mcp-server/index.ts`
- [x] 1.2 Fix `src/mcp-server/__tests__/app-template.test.ts` to import from the library; add the two new-scenario assertions (resource-equals-builder was NOT previously covered — added to server-wiring.test.ts; builder import discipline asserted by source scan)

## 2. Move the server to apps/

- [x] 2.1 `git mv examples/mcp-server apps/mcp-server` (main.ts, http.ts, server.ts, widgets/, TESTING.md); `server.ts` imports `buildAppTemplate` from `widgentic/mcp-server`
- [x] 2.2 Fix cross-imports: `src/mcp-server/__tests__/server-wiring.test.ts`, `src/store/__tests__/isolation.test.ts`, `src/designer/__tests__/designer.test.ts`, `examples/designer/main.ts` (widgets paths)
- [x] 2.3 `package.json`: `mcp` and `mcp:http` scripts → `apps/mcp-server/...`; `tsconfig.json` include gains `apps/**/*.ts`
- [x] 2.4 `Dockerfile`: `COPY apps ./apps` replaces the examples copy; `CMD` → `apps/mcp-server/http.ts`; `.dockerignore` markdown exception follows (`!apps/**/*.md`), `examples` added to the ignore

## 3. Docs

- [x] 3.1 README: entry paths, designer/library sections, Inspector command, TESTING.md link
- [x] 3.2 `apps/mcp-server/TESTING.md`: self-references and host registration snippets updated to the new paths
- [x] 3.3 `src/designer/io.ts` doc comments: emit-target path

## 4. Verification

- [x] 4.1 Full `npm test` + typecheck green; no file under `src/` imports from `apps/` or `examples/` except the enumerated test fixtures (grep-verified — fixtures now import from `apps/`)
- [x] 4.2 `docker build` succeeds; the image context contains no `examples/`; container serves `/mcp` locally with the existing key behavior
- [x] 4.3 Rig smoke: `npm run mcp:http` + `npm run designer` both start; `list_widgets` over HTTP returns the compiled-in kinds

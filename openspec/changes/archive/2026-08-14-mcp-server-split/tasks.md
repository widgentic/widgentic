# Tasks — MCP Server Split

## 1. Library assembly

- [x] 1.1 `git mv apps/mcp-server/server.ts src/mcp-server/server.ts`; imports go relative (`../catalog/index.js`, …); drop `createDefaultCatalog` (example policy) and the `customWidgets` import; default catalog/themes = built-ins
- [x] 1.2 `package.json`: `"./mcp-server/sdk": "./src/mcp-server/server.ts"` export; `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod` added as optional `peerDependencies` (majors pinned to the devDependency versions)
- [x] 1.3 Tests: wiring + isolation suites import `createWidgenticServer` from the library; new assertions — default assembly lists exactly the built-ins; base-entry modules (everything but `server.ts`) stay SDK-free by source scan

## 2. Lean production server

- [x] 2.1 `apps/mcp-server/http.ts`: import the assembly from `widgentic/mcp-server/sdk`; delete the `customWidgets` import and the anonymous `extraWidgets` branch — anonymous composes to built-ins only
- [x] 2.2 Delete `apps/mcp-server/main.ts`; move `widgets/` to the example; `apps/mcp-server/` is `http.ts` + `TESTING.md`

## 3. The guiding example

- [x] 3.1 `examples/mcp-server/`: `widgets/` (moved from apps) + `main.ts` — build a catalog with the customs registered, pass it to the library assembly, connect stdio; header comment framing it as the custom-deployment template
- [x] 3.2 `package.json`: `npm run mcp` → `examples/mcp-server/main.ts`
- [x] 3.3 Repointed fixtures: app-template (customWidgets), designer test (invoice), designer demo (both widgets), `io.ts` emit-target comments; isolation test's no-store expectation updated to the built-ins-only default (the old expectation encoded the removed behavior)

## 4. Verification, deploy, docs

- [x] 4.1 Full `npm test` + typecheck green (488 + 1 gated); boundary grep — no non-test `src/` import of `apps/`/`examples/`; `apps/` imports no `examples/`
- [x] 4.2 Docker: image = `src/` + lean `apps/` (no examples); rig smoke — stdio example handshakes and lists built-ins+invoice+x-post, `npm run mcp:http` (no store) lists built-ins only
- [x] 4.3 v14 deployed; production matrix verified: bootstrap key = built-ins+invoice+x-post (stored copies), no-key AND unknown-key = built-ins only; user-catalog path unchanged (same compose call, covered by isolation suite). One incident: the first v14 deploy passed an empty `sessionSecret` (scratch file had been cleaned) which REMOVED the container secret — redeployed with a fresh secret and extended the redeploy contract: recover live secret values via `az containerapp secret show`, never from scratch files
- [x] 4.4 README (paths, capability row, anonymous wording) + TESTING.md (production narrowing, redeploy contract v14 extension)
- [x] 4.5 TESTING.md moved to the repo root as the project-wide testing & operations runbook (it long outgrew the MCP server); content audit: retitled, Inspector/Desktop/Claude-Code snippets → example paths, dead `.mcp.json` claim replaced with `claude mcp add`, per-principal smoke no longer claims 401-without-key, anonymous-fallback wording matches v14, mangled Entra/local-dev paragraph reflowed, "Verified hosts (2026-07)" → dated "Verification log"; `.dockerignore` markdown exception dropped (no md ships in the image)

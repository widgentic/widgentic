# Apps Layout — Productive Code Leaves examples/

## Why

`examples/` was born as a test site for the local MCP server, but it no longer holds examples: `examples/mcp-server/http.ts` is the entry the production Dockerfile runs, `server.ts` is the real server assembly, `app-template.ts` is the MCP Apps iframe loader every deployment serves, and `widgets/` is compiled into the production catalog. Four library tests in `src/` already import across into `examples/` — the boundary is wrong, and change 3 (`widgentic-app`) is about to add a second deployable. Before it does, deployables get a home that says what they are.

## What Changes

- **`apps/mcp-server/`**: the deployed MCP server moves out of `examples/` wholesale — `main.ts`, `http.ts`, `server.ts`, `widgets/`, `TESTING.md`. The upcoming widgentic.dev app will be born as `apps/web/` (change 3 builds it; this change only clears the ground).
- **`app-template.ts` is promoted into the library** at `src/mcp-server/app-template.ts`, exported as `buildAppTemplate()` from `widgentic/mcp-server`. It is already zero-dep (imports only `widgentic/theming`), its test already lives in `src/mcp-server/__tests__/`, and the library already exports the resource URI it fills — the template belongs to the library, not to one deployment of it.
- **`examples/` keeps only the designer demo** (`examples/designer/`), which is genuinely a local rig.
- **Every reference follows**: Dockerfile (`COPY` + `CMD`), `.dockerignore`, npm scripts (`mcp`, `mcp:http`), `tsconfig.json` include, the four cross-imports in `src/` tests, the designer demo's widget imports, README, and TESTING.md.
- **No behavior changes**: the served template, the tool results, and the production image's runtime behavior stay byte-identical; this is a relocation with one export promotion.

## Capabilities

### Modified Capabilities

- `mcp-server`: the runnable server's documented home becomes `apps/mcp-server/`, and the app template gains a library export (`buildAppTemplate`) instead of living in the deployment.
- `widget-designer`: the copy-as-TypeScript target path becomes `apps/mcp-server/widgets/`.

## Impact

- `git mv examples/mcp-server apps/mcp-server`; `git mv` of `app-template.ts` into `src/mcp-server/`.
- `Dockerfile`: `COPY apps ./apps` (the designer demo no longer ships in the image), `CMD` → `apps/mcp-server/http.ts`.
- `package.json` scripts, `tsconfig.json` include (`apps/**/*.ts` added, `examples/**/*.ts` kept for the demo), `.dockerignore` markdown exception.
- Import fixes: `src/mcp-server/__tests__/{app-template,server-wiring}.test.ts`, `src/store/__tests__/isolation.test.ts`, `src/designer/__tests__/designer.test.ts`, `examples/designer/main.ts`, and `src/designer/io.ts` doc comments.
- The in-flight `widgentic-app` change's artifacts are updated to target `apps/web/` after this archives.
- No new dependencies; no production redeploy required (the next image build, v11, picks the paths up).

# Design — MCP Server Split

## Context

After the widgentic.dev app (change: widgentic-app), custom widgets live in the store per principal; the compiled-in `apps/mcp-server/widgets/` set only feeds the anonymous catalog and the demo rig. The server assembly is ~200 lines of SDK wiring used identically by the HTTP entry, the stdio entry, and four test suites.

## Decisions

**D1 — The assembly is a library entry, and the SDK is a peer there.** `createWidgenticServer` moves to `src/mcp-server/server.ts`, exported from a new **`widgentic/mcp-server/sdk`** subpath. `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, and `zod` become optional peer dependencies — exactly the `./store/cosmos` pattern: only hosts importing the subpath install them, `package.json` still has no `dependencies` section, and the base `./mcp-server` entry (definitions, handlers, template builder, image inlining) stays importable without any SDK. Rejected: exporting the assembly from the base entry (would drag the SDK into every consumer and break the entry's dependency-free requirement).

**D2 — The library default is built-ins only.** `createWidgenticServer()` with no options serves `createCatalog()` + `createThemeRegistry()`. `createDefaultCatalog` (built-ins + compiled-in customs) was example policy masquerading as a default; it moves into the example, which passes its catalog explicitly. Hosts state their extras; the library assumes nothing.

**D3 — Production anonymous = built-ins.** `apps/mcp-server/http.ts` stops compiling in `invoice`/`x-post`; an unknown or absent key gets the four built-in kinds. Accepted consequence, deliberately: the app is now the path to custom widgets, the bootstrap principal already owns stored copies of both kinds (verified live), and an anonymous catalog that mirrors the library default is the honest surface. The rig's TESTING.md gains a note.

**D4 — The example is self-contained guidance.** `examples/mcp-server/` = stdio `main.ts` + `widgets/` + a catalog built from them, passed to the library assembly. It imports only public `widgentic/*` entries — copy the folder, swap the widgets, and you have a custom deployment. No example code is imported by `apps/` or `src/` non-test code; test fixtures may import example widgets (they are shared fixtures, not production surface).

**D5 — `npm run mcp` follows the stdio entry to the example.** The script exists for Claude Desktop/Code registration and the Inspector; both are demonstration contexts. `npm run mcp:http` keeps pointing at production code.

## Risks / Trade-offs

- [Anonymous catalog narrows in production] → Intentional (D3); bootstrap + user keys unaffected; documented in TESTING.md and verified at deploy.
- [SDK version drift between peer range and devDependency] → Pin the peer ranges to the majors already in devDependencies; the interop suite runs against the installed versions on every `npm test`.
- [Example rot] → The example is exercised by the test fixtures that import its widgets and by the SDK interop suite building a catalog the same way.

## Migration Plan

Pure re-layout plus one deliberate production narrowing: build v14, deploy with the standing parameter set. Rollback is redeploying v13.

## Open Questions

_None. Designer-related changes are explicitly out of scope (next change)._

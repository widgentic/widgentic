## 1. The option

- [x] 1.1 `oauth/types.ts`: `pageAssets?: readonly PageAssetKind[]` on `AuthorizationDeps` (`"style" | "font" | "img" | "script"`), exported with the kinds as a constant.
- [x] 1.2 `oauth/pages.ts` and `handler.ts`: the policy admits `'self'` for each named kind; unknown kinds are refused at construction; with none named the header is unchanged.
- [x] 1.3 Tests: the five scenarios of "A host may admit its own origin on the pages", on the served header parsed into directives; the existing page tests still pass unchanged. Exports snapshot updated.

## 2. Docs and release

- [x] 2.1 `docs/develop/sign-hosts-in.mdx` and `packages/mcp/README.md` name the option; `docs:check` green.
- [x] 2.2 Changeset: `@widgentic/mcp` patch. A `TESTING.md` verification-log line.
- [x] 2.3 Gates: typecheck, `npm test`, build, `pack:check`, `openspec validate`; confirm the host bundle is unchanged apart from its version string.
- [x] 2.4 PR to staging; verify; archive.
- [ ] 2.5 Promote; release 0.16.1; back-merge.

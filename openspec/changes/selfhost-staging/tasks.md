## 1. Source-build image

- [x] 1.1 Root `.dockerignore` for repository-root contexts (design D2).
- [x] 1.2 `examples/docker/Dockerfile.source`: builder stage (`npm ci`, `npm run build`, `npm pack` of the four packages); runtime stage as the published Dockerfile with the manifest's `@widgentic/*` ranges and `overrides` rewritten to the tarballs before install; the import smoke kept (design D1).
- [x] 1.3 Build it locally from this checkout; confirm one copy of each `@widgentic/*` package from the tarballs, the import smoke passing, and both services starting; confirm the committed manifest is unchanged.
- [x] 1.4 `.github/workflows/ci.yml`: a non-required `selfhost-source-image` job building the variant (design D5).

## 2. Startup seed

- [x] 2.1 `examples/docker/seed.ts`: read and parse `WIDGENTIC_SEED_FILE`; write schemas, themes, actions, widgets in order through the store, skipping held names and kinds, logging refusals with code and a summary; never throw (design D3).
- [x] 2.2 `web.ts`: run the seed after identity in single-principal mode; a log line and nothing else in trusted-header mode.
- [x] 2.3 Tests for every scenario of the new requirement: populated empty store with a rendering widget; a person's theme survives; a widget with an unknown schema is refused with `UNKNOWN_SCHEMA` while the rest land; missing and non-JSON files start clean; unset and trusted-header write nothing.
- [x] 2.4 `examples/docker/seed/demo.json` from the demo's current schemas, themes and widgets, verbatim (design D4); a test that it seeds cleanly into an empty store.

## 3. Docs and gate

- [x] 3.1 Example README and `.env.example`: the source-build variant beside the linking recipe, and `WIDGENTIC_SEED_FILE` with the sample file.
- [x] 3.2 `TESTING.md` entry for the local source build and seed check.
- [x] 3.3 Gate: typecheck, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict selfhost-staging`, `openspec validate --specs`, `npm run docs:check`.

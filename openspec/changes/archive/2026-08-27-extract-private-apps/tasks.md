## 1. Owner prerequisites

- [x] 1.1 Create the empty private repository `widgentic/apps` on GitHub (no README/license bootstrap) and confirm push access from the dev VM

## 2. Extract the private repository

- [x] 2.1 Install `git filter-repo` into the scratch environment; from a fresh clone of `widgentic/widgentic`, extract the history of `apps/`, `infra/`, `Dockerfile`, `.dockerignore`, `TESTING.md` and `openspec/specs/widgentic-app/` (fallback per design D1 if the tool cannot be installed) into `/data/source/widgentic-apps`
- [x] 2.2 Scaffold the private repo: root `package.json` (private, runtime and dev deps per D2, scripts `mcp:http`, `web`, `typecheck`, `test`), `tsconfig.json` (no `paths`), `vitest.config.ts`, `.gitignore`, `README.md` (run locally, runbook link, `npm link` recipe), `.github/workflows/ci.yml`
- [x] 2.3 Adjust the moved files: delete the per-app `package.json` files; Dockerfile copies `package.json`, `package-lock.json`, `tsconfig.json`, `apps/` and runs `npm ci`; `RUNBOOK.md` assembled from the moved TESTING sections (Production, the widgentic.dev app, remote demo rig, verification log) with the `infra/` commands; OpenSpec root initialized with the project context and `specs/widgentic-app/spec.md` verbatim
- [x] 2.4 `npm install` against published `0.1.0`, typecheck and the app tests green in the private repo; run `mcp:http` and `web` locally; commit and push; CI green on `widgentic/apps`

## 3. Deploy from the private repository

- [x] 3.1 `az acr build … -t widgentic-mcp:v59` from `/data/source/widgentic-apps`, `az deployment group create` with the moved params template; verify `/healthz`, keyless catalog, served `app.bundle.js`; runbook entry recorded in `widgentic/apps`

## 4. Remove the apps from the public repository

- [x] 4.1 `git rm` `apps/`, `infra/`, `Dockerfile`, `.dockerignore`; drop the `apps/*` workspace, the `mcp:http`/`web` scripts, the `apps` vitest project, `apps/**/*.ts` from tsconfig, the apps rules and `@widgentic-apps/` case from `tools/boundaries.test.ts`; regenerate the lockfile
- [x] 4.2 README: collapse "Hosted endpoint" and "The widgentic.dev app" to a pointer paragraph; TESTING.md: rewrite the Layout section, trim Entries, move Production / app / rig / verification-log sections out with a pointer to `widgentic/apps` RUNBOOK.md
- [x] 4.3 Typecheck, full suite (boundary + snapshots included), `npm run build`, `npm run pack:check` green; `openspec validate --strict`; commit and push

## 5. Verification and closure

- [x] 5.1 Both repositories green in CI; production on v59 from `widgentic/apps`; `widgentic/widgentic` contains no `apps/`, `infra/` or Dockerfile and no reference to them outside the archive
- [x] 5.2 Update the dev-loop notes: the archive routine now runs per repository; app changes needing package changes follow release → bump

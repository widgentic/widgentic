## Why

The demo deployment of the self-host example (`demo.widgentic.dev`, frozen for the WebMCP
Challenge until it ended) becomes our staging environment. Two things stop it today: its
image installs `@widgentic/*` from the registry, so a feature branch cannot be staged
before a release; and its store is an `EmptyDir`, so every deploy starts empty and a
tester re-creates the same schemas, themes and widgets by hand before testing anything.

## What Changes

- **A source-build image variant.** `examples/docker/Dockerfile.source`, built with the
  repository root as context, compiles the four packages from the checkout in a build
  stage, packs them with `npm pack`, and installs those tarballs where the published image
  installs registry versions. The committed manifest is untouched, the import smoke still
  guards the entries, and the runtime stage is otherwise identical. A root `.dockerignore`
  keeps the context small. CI builds the variant on every pull request, beside the existing
  published-package build.
- **An opt-in startup seed.** With `WIDGENTIC_SEED_FILE` set, the authoring service loads a
  JSON document of shared schemas, themes, actions and widgets into the single principal at
  boot, through the store's validated writes: schemas first, widgets last, existing entries
  never overwritten, refusals logged with their code, the service starting regardless.
  Unset, nothing happens; in trusted-header mode the seed is ignored with a log line. Keys
  and secrets are never seeded.
- **A deployment key.** With `WIDGENTIC_DEFAULT_KEY_FILE` (or `WIDGENTIC_DEFAULT_KEY`)
  set, the MCP service accepts that one key for the single principal on every boot, so
  ChatGPT, Claude and Copilot stay configured across deploys. It is held as a digest,
  compared in constant time and never stored or logged, and it is read-only unless
  `WIDGENTIC_DEFAULT_KEY_SCOPES` names `execute`.
- **Sample content.** `examples/docker/seed/demo.json` carries the demo's current entries
  (two shared schemas, two themes, an agenda and an inbox widget) for staging and for any
  self-hoster who wants a populated first run.
- Docs: the example README (source build, seeding), `TESTING.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `self-host-example`: the image requirement gains the source-build variant; new
  requirements specify the optional startup seed and the deployment key.

## Impact

- **Code.** `examples/docker/` (`Dockerfile.source`, `seed.ts`, `deployment-key.ts`, `web.ts`,
  `mcp.ts`, `seed/demo.json`, README, `.env.example`), a root `.dockerignore`, `.github/workflows/ci.yml`.
- **No package change**, so no changeset: the four packages and their exports are
  untouched.
- **Cross-repo.** `widgentic/apps` sets `WIDGENTIC_SEED_FILE` on the demo's web container,
  drops the freeze from its runbook, and documents staging a branch: build this variant
  from the branch, deploy with `infra/selfhost.bicep`.

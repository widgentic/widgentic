## Context

See proposal.md. Content already exists in requirement form: the 14 capability specs, the README (architecture, end-to-end snippet, tool list, designer guide, actions, testing), `TESTING.md` (host registration snippets) and, in `widgentic/apps`, the host matrix and connection recipes. The authoring contract is code: `buildAuthoringGuide()` (`packages/mcp/src/server/guide.ts`) derives it from the validators; `TOKEN_SPECS` (`packages/core/src/theming/tokens.ts`) documents all 32 widget tokens. Mintlify: MDX + `docs.json`, GitHub App deploys, `mint` CLI (`validate`, `broken-links`, `dev`), monorepo mode, custom domains on the Starter plan (confirmed by the user).

## Goals / Non-Goals

**Goals:** one site for both audiences; reference pages that cannot drift from the validators; docs gated like code; the landing page's "Docs" links finally have a target.
**Non-Goals:** documenting private deployment details; versioned docs (the packages are 0.x, one line); an OpenAPI playground (the MCP surface is JSON-RPC tools, documented as pages); i18n.

## Decisions

1. **`docs/` in this repository, not a separate repo.** The reference generator imports the package sources (`tsx` + root `paths`), so generation and drift-checking stay one `npm` script and one CI job; the GitHub App's monorepo mode points at `/docs`. Alternative — `widgentic/docs` repo — would need a published-package install and a cross-repo bump on every validator change.
2. **Generator `tools/docs-generate.ts` (tsx), output committed.** Mintlify builds from the repository, so generated MDX must be in git; `--check` regenerates to a temp dir and diffs. Sources, all public exports (no package change needed): `buildAuthoringGuide()` from `@widgentic/mcp` — `widget`, `sharedSchema`, `theme` and `rules.{template,styles,dataSchema}` → `reference/authoring-contract.mdx` and `reference/template-dsl.mdx`, `limits` → `reference/limits.mdx`, `actions` + the ACTION form of `rules.template` plus `HTTP_METHODS`, `OUTPUT_MODES`, `PROMPT_TEXT_MAX`, `SECRET_NAME`, `ACTION_NAME` from `@widgentic/core` → `reference/action-definition.mdx`; `TOKEN_SPECS`, `TOKEN_DEFAULTS` (the light defaults) and `darkTheme` (the only preset) → `reference/theme-tokens.mdx`; the seven `*_TOOL` definitions from `@widgentic/mcp` → `reference/mcp-tools.mdx`; the runtime export names of every published entry (the same list `tools/exports.test.ts` snapshots) → `reference/api/<entry>.mdx`, so the API index can never list a symbol that does not exist. Each file opens with a comment naming its source module and the command; the generator is deterministic (sorted keys, no dates).
3. **Hand-written pages take their content from the specs and README**, rewritten in Mintlify's voice (second person, sentence case); the "How it works" tab is the architecture and trust model told for readers, linking to the spec for the normative text (specs stay the contract; docs explain).
4. **`mint` exact-pinned as a devDependency** (`npm run docs:dev|docs:check`), run through `./node_modules/.bin/mint` in scripts; CI adds one job `docs` alongside `verify`: `docs:generate --check`, the navigation test, `mint validate` (strict by default — it exits non-zero on warnings, so "warnings are errors" needs no flag), `mint broken-links --check-anchors` (pages link to headings), `mint a11y --fail-on-error`. `mint` downloads its client from `releases.mintlify.com` on first run; the runner needs that egress.
5. **Images:** the mark from the apps repo's brand assets is copied into `docs/images/` (the PNG/SVG are already public on widgentic.dev); diagrams as Mermaid where a picture earns its place (pipeline, trust boundary); no screenshots that would age (the designer UI changes per release) except one hero screenshot on the Design overview, refreshed per minor.
6. **Host matrix page** carries the generic three-host findings (what each host proxies/advertises), not deployment verification logs.
7. **Navigation completeness is a repo test**, `tools/docs-nav.test.ts`: every `docs/**/*.mdx` is referenced from `docs.json` navigation or carries `hidden: true` in its frontmatter, and every navigation entry resolves to a file. `mint validate` checks pages it knows about; it does not flag orphans.
8. **Colours: link blue `#1E6F92` is the primary**, not widget blue — `mint a11y` measures `colors.primary` against the light background and widget blue `#40A0C8` fails the 3:1 threshold; `#1E6F92` (the landing's link blue) passes at 5.61:1, and widget blue stays as `colors.light` (dark-mode emphasis) and in the mark. Discovered during apply; the spec text was corrected rather than the gate loosened.
9. **`chrome` is documented as available from `@widgentic/designer` 0.2.0** (archived `designer-chrome-tokens`, publish pending) so the page is true the moment the release lands.

## Risks / Trade-offs

- [`mint validate` warnings on legitimate MDX] → it already fails on warnings; fix or `.mintignore` deliberately rather than loosening the gate.
- [Generated pages are large] → split by section, keep an index page; the authoring guide is already sectioned.
- [Docs and specs diverge] → docs link to spec anchors; the archive routine's "docs travel with the change" rule extends to `docs/`.
- [Mintlify plan limits] → Starter confirmed to include custom domains; features used are core (MDX, navigation, components).

## Migration Plan

1. Scaffold `docs/` + generator + CI locally (`mint dev`), validate green. 2. `[USER]` Mintlify dashboard → Git settings → connect `widgentic/widgentic`, "Docs are in a subdirectory" on, path `/docs`, GitHub App with access to this repository only (done 2026-08-29; the first deploy fails until `docs/docs.json` is on `main`). 3. `[USER]` Domain setup → add `docs.widgentic.dev`; in the Cloudflare zone `widgentic.dev` add TXT `_acme-challenge.docs` and TXT `_cf-custom-hostname.docs` with the dashboard values FIRST, wait until both show verified, then `CNAME docs → cname.mintlify.builders` DNS-only (grey cloud); zone settings per Mintlify: SSL/TLS Full (strict), "Always Use HTTPS" off (inert while every record is grey-cloud). TLS is provisioned by Mintlify within hours of propagation. 4. In `widgentic/apps`: the landing's four README hrefs → `https://docs.widgentic.dev`, RUNBOOK DNS facts, deploy. Rollback: DNS record removal returns the landing's links to the README.

## Open Questions

- Mintlify subdomain name (`widgentic.mintlify.site` if free) — chosen at connection time by the user; affects nothing in the repo.

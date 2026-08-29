## 1. Scaffold and configuration

- [x] 1.1 `docs/docs.json`: name, brand colours, logo light/dark + favicon (`docs/images/`), five tabs with groups, footer links (widgentic.dev, GitHub, npm), `llms.txt` default
- [x] 1.2 `mint` 4.2.842 exact-pinned (client 0.0.3534 downloads fine from this network); scripts `docs:dev`, `docs:generate`, `docs:check` (`generate --check` + nav test + `mint validate` + `mint broken-links --check-anchors` + `mint a11y --fail-on-error`; this CLI build exits non-zero on a11y failures with or without the flag)
- [x] 1.3 CI job `docs` running `docs:check`

## 2. Generated reference

- [x] 2.1 `tools/docs-generate.ts`: authoring contract / template DSL / limits (from `buildAuthoringGuide()`), action definition (from the guide's `actions` + ACTION template form + `HTTP_METHODS`, `OUTPUT_MODES`, `PROMPT_TEXT_MAX`, `SECRET_NAME`, `ACTION_NAME`), theme tokens (from `TOKEN_SPECS`, `TOKEN_DEFAULTS`, `darkTheme`), MCP tools (from the `*_TOOL` definitions), API export index per published entry; "generated — do not edit" headers naming the source
- [x] 2.2 `--check` mode (regenerate to temp, diff, non-zero with paths); `tools/docs-generate.test.ts` (two runs identical; `--check` detects a mutated page); `tools/docs-nav.test.ts` (every page in navigation or hidden; every nav entry resolves)

## 3. Pages

- [x] 3.1 Get started: index (two audience paths), what widgentic is, quickstart, connect a host (six hosts, snippets from TESTING.md and the apps runbook in generic form), keys and scopes
- [x] 3.2 Design: widget designer, template DSL (with links to the generated rules), data schemas, themes, actions and secrets, groups and hints, authoring with an agent
- [x] 3.3 How it works: payload contract, payload to pixels, inline rendering and fallback, per-principal catalogs, trust model, host matrix
- [x] 3.4 Develop: packages, render in your host, embed the designers (`chrome` "from 0.2.0"), run your own server, MCP tools; API reference intro pointing at the generated per-entry export index
- [x] 3.5 Reference index linking the generated pages and the three CHANGELOGs

## 4. Quality and hosting

- [x] 4.1 `docs:check` clean (generate --check, nav test, `mint validate`, `mint broken-links --check-anchors`, `mint a11y --fail-on-error`); every image has alt text, every code block a language
- [x] 4.2 `[USER]` Mintlify: repository connected 2026-08-29 (`widgentic/widgentic`, `main`, subdirectory `/docs`, GitHub App on this repo only); first green deploy on the Mintlify subdomain once `docs/` is on `main`
- [x] 4.3 `[USER]` Domain: `docs.widgentic.dev` added 2026-08-29 — both TXT records resolve, CNAME → `cname.mintlify.builders` in place, HTTPS answers 200 with a valid certificate
- [x] 4.4 README: docs link in the header paragraph, remove the "next on the backlog: docs site" sentence; `TESTING.md`: docs section (commands, operator steps in generic form) and a dated entry
- [x] 4.5 Downstream in widgentic/apps: the landing's four hrefs point at `https://docs.widgentic.dev`, deployed as v66

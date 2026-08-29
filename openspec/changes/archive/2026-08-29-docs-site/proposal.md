## Why

widgentic has a landing page and three published packages but no documentation site: the README carries everything, the authoring contract lives only inside `get_authoring_guide`, and the landing page's "Docs" links point at the README as a placeholder. Designers (people building widgets in the app) and developers (people embedding the packages or running a server) need one place that explains how it works and how to use it — and the reference parts must be derived from the validators, not retyped.

## What Changes

- A `docs/` folder in this repository holds a Mintlify site: `docs.json` (brand theme, logo, favicon, tabs) and MDX pages, deployed by Mintlify's GitHub App from `main` (monorepo mode, path `/docs`) with PR previews, served at `docs.widgentic.dev`.
- Information architecture in five tabs: **Get started** (what it is, quickstart, connect a host, keys and scopes), **Design** (the widget designer, template DSL, data schemas, themes, actions and secrets, groups and hints, authoring with an agent), **How it works** (the contract, rendering pipeline, MCP Apps inline rendering, per-principal catalogs, trust model, host matrix), **Develop** (packages, render in your host, embed the designers, run your own server, MCP tools, API reference per entry), **Reference** (generated).
- **Generated reference:** `npm run docs:generate` writes the Reference pages from the exported constants and validators — the authoring guide (`buildAuthoringGuide()`, including its `actions` section), the theme tokens (`TOKEN_SPECS`, the light defaults and the `dark` preset), the action vocabulary constants, the seven tool definitions, and the export index of every published package entry — into `docs/reference/**/*.mdx`; the committed output is checked in CI (`docs:generate --check` fails on drift).
- CI gates for docs: generated pages current, every page reachable from navigation (a repo test — `mint` does not flag orphans), `mint validate` (strict by default), `mint broken-links --check-anchors`, `mint a11y --fail-on-error`.
- Writing standard: Mintlify conventions (second person, sentence case, language-tagged code, alt text), no production facts beyond the public endpoints (`widgentic.dev`, `mcp.widgentic.dev/mcp`, `docs.widgentic.dev`).
- Not in scope: versioned docs, i18n, a docs search assistant, changelog automation (Changesets already produces CHANGELOGs; the Reference links to them).

## Capabilities

### New Capabilities

- `docs-site`: the public documentation site — its source location and build, information architecture, generated reference pages, quality gates and hosting contract.

### Modified Capabilities

_None._

## Impact

- New `docs/` tree (≈35 MDX pages, `docs.json`, images), `tools/docs-generate.ts` + `docs:generate` script, `mint` as an exact-pinned devDependency, CI steps, README link to the docs; `TESTING.md` entry.
- Operator steps `[USER]`: connect this repository in the Mintlify dashboard (monorepo path `/docs`), add the domain `docs.widgentic.dev` (TXT records, then CNAME to `cname.mintlify.builders`, DNS-only in Cloudflare).
- README: docs link in the header and the "next on the backlog: docs site" sentence removed.
- Downstream in `widgentic/apps`: the landing's four README hrefs (nav, hero, developer section, footer) become `https://docs.widgentic.dev`; DNS facts in its RUNBOOK.

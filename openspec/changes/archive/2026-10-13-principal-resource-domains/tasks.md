## 1. Core domain rule

- [x] 1.1 Add `parseResourceDomain(input)` and `RESOURCE_DOMAIN_LIMIT = 20` to `@widgentic/core`, beside the URL guards. The parser returns `{ origin, host, wildcard }` or `{ error }`, where the error is a short reason a person can read. It checks labels over ASCII and never uses `URL` (design D1, D2). Export both and update the `tools/exports.test.ts` snapshots.
- [x] 1.2 Add a `matchesResourceDomain(hostname, parsed)` helper for the inliner. An exact host matches. A wildcard matches any depth of subdomain but never the apex.
- [x] 1.3 Unit tests covering every accepted form and every refusal listed in the widget-store requirement:
  - IPv4 and IPv6 literals, `localhost`, ports, paths, queries, userinfo;
  - the wildcard placements;
  - CSP-injection characters;
  - non-ASCII, and punycode accepted;
  - the label and length bounds, and canonicalization.

## 2. Store

- [x] 2.1 In `settings-rules.ts`, add `resourceDomains` to `PrincipalSettings` and `SETTINGS_SECTIONS`, and add `checkResourceDomains(value)`, which returns the canonical, deduplicated entries and one problem per refusal: `INVALID_SHAPE` for a value that is not an array of strings or that holds more than the limit, and `INVALID_DOMAIN` for a rejected entry, naming it. `checkSettings` dispatches per section (design D10). `applySettingsUpdate` throws the first problem, and an empty list removes the section. Add `INVALID_DOMAIN` to `StoreRejectionCode`.
- [x] 2.2 `readSettings` keeps the entries that pass and reports each dropped entry by name. A record without the section reads as no domains.
- [x] 2.3 Add `readPrincipalSettings(store, id)`, which never throws, and `composeResourceDomains(store, id, { settings? })`. `composeThemes` accepts the same optional `settings` promise, and both still read by themselves when given none (design D6). Export them from `./store`.
- [x] 2.4 Check that the memory, file, SQLite and Cosmos `putSettings` paths carry the new section:
  - a domains-only update checks no theme and leaves `defaultThemes` as stored;
  - Cosmos still checks only the defaults its update writes.
- [x] 2.5 Contract-suite tests for every scenario of "Resource domains are a settings section", against all four adapters. Include:
  - old-shape regression tests (a record without the section, and a stored malformed entry);
  - a test that the existing settings scenarios still pass with two sections defined.

## 3. Authoring surface

- [x] 3.1 `rejectionStatus` maps `INVALID_DOMAIN` to `422`.
- [x] 3.2 Tests for the authoring-api scenario "A refused domain names the entry", through the core handler and the Node adapter.

## 4. Server assembly and inliner

- [x] 4.1 `createWidgenticServer` parses `resourceDomains` with the core rule. It declares canonical origins, deduplicated in first-seen order, on the declaration and the read content, and silently drops refused entries (design D4). Update the option's doc comment: operator and principal entries, and inline-last.
- [x] 4.2 `inline-images.ts`:
  - replace `skipHosts` with the parsed declared domains;
  - rank undeclared sources before declared ones, keeping shape priority and document order within each group (design D3);
  - leave a declared source unfetched only when it falls outside the cap;
  - in the stderr note, count declared leftovers apart from the rest;
  - update the module header.
- [x] 4.3 Tests for every modified mcp-server scenario, in particular:
  - the declaration's canonical origins over the SDK, on `resources/list` and `resources/read`;
  - refused entries not declared;
  - the 30-source overflow split (20 undeclared and 4 declared inlined, 6 declared kept);
  - declared sources inlined when room remains;
  - the wildcard ranking;
  - the stderr note's separate counts;
  - no output change at all when no domains are configured.
- [x] 4.4 Run `npm run conformance:generate` after any change to handler output. The corpus entries for configs without domains must keep their recorded output; the new domain cases come with 5.2.

## 5. Host bundle

- [x] 5.1 `createWidgenticHost`:
  - accept `config.resourceDomains`, and report a refused entry under section `resourceDomains`;
  - check `settings.resourceDomains` through `checkSettings`, and report refusals under section `settings`;
  - give the app template's `resourceDomains` in `resources()` (operator entries first, then the section, canonical and deduplicated), with the key absent when the list is empty (design D11);
  - update the module header and the config error message.
- [x] 5.2 Add the resource-domain cases to `tools/conformance-generate.ts` (operator entries, a settings section, and the two combined, each as `resources()`) and regenerate the corpus. A refused entry is covered by the host tests (5.3, 6.3), since .NET refuses such a configuration at startup. Configs without domains must keep their recorded output.
- [x] 5.3 Tests for the two new host-bundle scenarios, in `host.test.ts` and in the bare-realm test. Assert that the bundle's list equals the Node assembly's declaration for the same operator list and settings.

## 6. Widgentic.Mcp

- [x] 6.1 Startup: pass `WidgenticOptions.ResourceDomains` into the bundle config and the startup record's section with the settings. Build the declaration from the startup host's `resources()`. A refused domain throws `WidgenticConfigurationException`, naming the section (`resourceDomains` or `settings`), the source and the code. Update the `ResourceDomains` doc comment.
- [x] 6.2 Per caller, with a catalog source:
  - the app resource's read handler resolves the caller's catalog;
  - it combines the `resourceDomains` section with the startup record, Merge or Replace;
  - it creates a domains-only host in a leased runtime and declares that host's `resources()` list;
  - a `ListResourcesFilters` entry rewrites the app entry's `_meta.ui` on `resources/list`, wherever the entry falls in the page;
  - a refused principal domain is logged, and a throwing source falls back to the startup declaration and is logged (design D12).
- [x] 6.3 Tests for every dotnet-host scenario this change adds or modifies:
  - in `ProtocolTests`: the canonical declaration on list and read, and a refused operator domain stopping startup;
  - in `PrincipalCatalogTests`: Merge, Replace, a refused principal domain, concurrent principals against a pool of 4, a failing source, and the app entry rewritten among other listed resources while the registered declaration stays untouched (SDK 2.2 lists registered resources in one page);
  - global surfaces unchanged when no domains are configured.
- [x] 6.4 In the sample, give the Merge principal's settings one resource domain to demonstrate the path, and extend `SampleTests` to read the app resource as that principal and as the other one.
- [x] 6.5 Update the `Widgentic.Mcp` README (the render-only limits and the declaration sources) and the CHANGELOG under the 0.11.0 entry.

## 7. Settings designer

- [x] 7.1 Add the "Resource domains" subsection to `settings-designer.ts`:
  - rows with an input and a remove button, plus an add input;
  - live marks from `parseResourceDomain`, showing the canonical form or the reason;
  - valid entries recorded canonical, invalid ones kept as typed;
  - the add control disabled at `RESOURCE_DOMAIN_LIMIT`;
  - inert in read-only mode (design D8).
- [x] 7.2 Extend the designer's own `checkSettings` and `SettingsRecord`. `getSettings()` carries `resourceDomains` only when the supplied record had it or the person edited the list.
- [x] 7.3 Explanatory text derived from the limit and the accepted forms. It covers the trust note (any render may load from a listed domain in the viewer's browser; list only domains you control), the redirect caveat, and the fact that a change applies once the chat client reloads (claude.ai keeps the previous policy for the page session).
- [x] 7.4 Tests for every Settings designer scenario, through the factory and the `<widgentic-settings-designer>` element, with the existing defaultThemes scenarios unchanged.

## 8. Self-host example

- [x] 8.1 `examples/docker/mcp.ts` starts one settings read per request with `readPrincipalSettings`. It passes that read to `composeThemes` and `composeResourceDomains`, logs their diagnostics as it does today, and passes `resourceDomains` to the assembly.
- [x] 8.2 Tests for the self-host scenarios:
  - a principal's domains appear on its app resource read;
  - another principal and an anonymous caller get no `csp`;
  - the store's settings are read once per request;
  - a saved change applies on the next request.
- [x] 8.3 Make sure the seed accepts `settings.resourceDomains` through the validated write. Leave the demo seed without domains; the probe sets one through Settings.

## 9. Docs, backlog and release notes

- [x] 9.1 Update the docs:
  - `docs/develop/run-your-own-server.mdx`: the `resourceDomains` row now covers origins, the principal union and inline-last;
  - `docs/how-it-works/inline-rendering.mdx`: the declared-domain paragraph;
  - `docs/how-it-works/trust-model.mdx`: what a person's declaration grants, with the shared-host, privacy and redirect notes;
  - `docs/develop/embed-the-designers.mdx`: the settings designer's new subsection;
  - `docs/how-it-works/per-principal-catalogs.mdx` and a .NET docs page: checked; neither lists settings sections, and the .NET story lives in `dotnet/README.md` (task 6.5);
  - the generated API reference (`npm run docs:generate`).
- [x] 9.2 Update the README capability rows and `packages/mcp/README.md`, covering the store section, `composeResourceDomains` and `INVALID_DOMAIN`.
- [x] 9.3 Update `BACKLOG.md` RND-5: declared domains carry overflow on hosts that honor them, and the probe results set the item's priority (design D7).
- [x] 9.4 Add changesets for core (the rule), mcp (the section, composition, the declaration and inline-last, with the operator behavior change stated) and designer (the subsection), all minor.
- [x] 9.5 Add a dated `TESTING.md` verification-log entry.

## 10. Gates

- [x] 10.1 Run typecheck, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict principal-resource-domains` and `openspec validate --specs`. All must pass. Run `npm run build`, then `cd dotnet && dotnet test --solution Widgentic.slnx -c Release`; it is required here because the bundle and the corpus change.

## 11. Staging and the host probe

- [x] 11.1 Build and deploy the branch image to staging (demo.widgentic.dev). Verify the served bundle and the keyed `resources/read` from the downloaded bytes: the principal's origin is declared when keyed, and absent on an anonymous read.
- [x] 11.2 Re-check, through the per-principal path, the hosts already covered by D9's smoke test (claude.ai web, ChatGPT, VS Code Copilot):
  - a domain saved in Settings loads directly in a new conversation after the client reloads;
  - removing it falls back to inlining, rows 25–30 of a 30-source render go blank again, and small renders still show every image.
- [x] 11.3 Record the per-host results in `docs/how-it-works/host-matrix.mdx` and `TESTING.md`, covering the smoke test and 9.2: honored hosts, enforced `img-src`, claude.ai's effective header and its caching for the page session. RND-5 stays P3 (D7).

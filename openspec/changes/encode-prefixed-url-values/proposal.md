## Why

An agent reported that an image whose `src` binds a value behind a prefix breaks when the value contains `?` or `&`.

**Reproduced on 0.14.0.** A template `{ "src": { "bind": "name", "prefix": "https://api.dicebear.com/9.x/initials/svg?seed=" } }` over the value `Ada & Lin?x=1#y` renders:
```
src="https://api.dicebear.com/9.x/initials/svg?seed=Ada & Lin?x=1#y"
```
The `&` starts a new query parameter, the second `?` and the `#` restructure the URL, and the service receives `seed=Ada `.

**Two more paths do the same.** The card and table `hints.links` prefix composes `hint + value` with no encoding. So does the app template's client-built preview of those cells.

**What is not affected.** A whole URL bound to `src` or `href` renders correctly: the tree keeps it raw, the HTML escapes `&` as `&amp;`, and the image inliner unescapes it before fetching.

## What Changes

- **One encoding rule for a value behind an author prefix**, used by the template `prefix` transform, the card and table `hints.links` prefix strings, and the app template's preview.
  - **After a prefix that is exactly `http:`, `https:`, `http://` or `https://`**, the value is the rest of a URL (`//host/path?query`, or `host/path?query`). It is encoded the way a browser encodes a whole URL: whitespace, control characters, quotes, `<`, `>`, backslash, `^`, backtick, `{`, `|`, `}` and non-ASCII characters are percent-encoded, and `%`, `?`, `&`, `#` and the other URL delimiters are kept. A value behind such a prefix renders as it did, since a value that is already a valid URL contains none of those characters.
  - **After a `data:` prefix** (`data:image/png;base64,`), the value is kept as written: the URL guard admits only a base64 image source, whose alphabet needs no encoding.
  - **After any other prefix that is only a scheme** (`mailto:`, `tel:`), the value is the scheme's address. It keeps every character an address uses (`@`, `+`, `.`, `-`, `:` and the other RFC 3986 sub-delimiters) and percent-encodes the rest, including `%`, `?`, `#`, `&`, whitespace, control characters, quotes, `<`, `>`, backslash, `^`, backtick, `{`, `|`, `}` and every non-ASCII character, as UTF-8. `mailto:ada@example.org` and `tel:+15551234` render exactly as today, while a value can no longer add a `?subject=` or cut the address at `#`.
  - **After any other prefix** (a query `…?seed=`, a path `…/avatars/`), the value is one URI component, encoded as `encodeURIComponent` encodes it. `Ada & Lin?x=1#y` becomes `Ada%20%26%20Lin%3Fx%3D1%23y`.
  - **Unchanged:** an empty value still emits nothing, and the composed URL still faces the scheme guard.
- **Steering follows.** The new core constant `PREFIX_ENCODING_RULE` states the rule once. The authoring guides (`get_authoring_guide`, and the webmcp `authoring_guide` copy), the card and table `links` hint descriptions and the designer's prefix field all derive from it.
- **Release.** Patches for `@widgentic/core` (the renderers), `@widgentic/mcp` (the bridge preview, the guide), `@widgentic/webmcp` (its guide copy) and `@widgentic/designer` (its prefix field title), so `Widgentic.Mcp` follows with the pin. This change rides with the date and widget-theme changes queued after it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-widgets`: "Template node forms and interpretation". The `prefix` transform encodes the value, and new scenarios cover a query prefix, a bare scheme and an empty value.
- `widget-catalog`: "Card data handling" and "Table data handling". The `hints.links` prefix composes by the same rule, with a scenario each.
- `mcp-server`: a new requirement, "Previews compose links as the result does". The app template's client-built card and table previews build the same `href` the renderer does.

## Impact

- **Code.** `packages/core/src/templates/compile.ts`, `packages/core/src/catalog/widgets/format.ts` and one new internal helper module in core. `packages/mcp/src/server/app-template.ts` (`cellNode`, within its size budget), `packages/mcp/src/server/guide.ts`, `packages/webmcp/src/guide.ts`, and the catalog descriptors.
- **Corpus.** The conformance corpus regenerates: the guide and `list_widgets` texts change, the app template changes, and new prefix cases are added. `dotnet test` covers the bundle.
- **Stored data.** Nothing changes. A read-only production scan (2026-10-21) found 11 `prefix` transforms across 7 of 25 stored widgets, all of them bare schemes:
  - 5 `mailto:` and 5 `tel:` on `href`. An email address renders byte for byte as before. A phone number with spaces (`+1 250-555-0163`) gains `%20` per space, which a dialer decodes to the same number;
  - 1 `https:` on `src`, which the URL-remainder case keeps exactly as it renders today.
- **Docs.** `docs/design/template-dsl.mdx` (the `prefix` paragraph) and `docs/design/groups-and-hints.mdx` (`hints.links`).
- **Out of scope.**
  - Values bound whole into a URL attribute, which are already correct.
  - Paths that contain `/`: such a value behind a path prefix becomes one encoded segment (`a%2Fb`). Bind the whole URL instead.

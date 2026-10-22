## Context

See proposal.md for the motivation. Current state:

- **Template `prefix`.** `packages/core/src/templates/compile.ts` emits `raw.prefix + formatValue(resolved)` for a non-empty value. The URL guard then checks only the scheme.
- **Built-in links.** `packages/core/src/catalog/widgets/format.ts` `linkOrText` builds `hint + raw` for a string `hints.links` value, used by the card and the table.
- **The bridge.** `packages/mcp/src/server/app-template.ts` `cellNode` builds the same `hint + raw` for its client-built preview of card fields and table cells. The template is at 44,631 of 45,056 raw bytes.
- **Whole URLs** bound with no prefix are correct today: the tree keeps the raw string, `renderToHtml` escapes `&` as `&amp;`, and `inline-images.ts` unescapes before fetching.
- **Production** holds 11 prefixes in 7 of 25 stored widgets, all bare schemes: 5 `mailto:` and 5 `tel:` on `href`, and 1 `https:` on `src` (read-only scan, 2026-10-21).

## Goals / Non-Goals

**Goals:**
- **Data never restructures a URL whose shape the author fixed.** Behind a query or path prefix, a bound value can't add parameters, a fragment or a path. Behind a bare `mailto:`/`tel:`, it can't add header fields or a fragment. A bare web prefix hands the value the URL on purpose.
- **One rule on every path.** The template, the built-ins and the bridge preview all apply it.
- **Stored widgets keep working.** Email addresses and `https:` remainders render byte for byte as before; a phone number's spaces become `%20`, which dialers decode to the same number.

**Non-Goals:**
- Encoding whole bound URLs. The author asked for the value to *be* the URL.
- A per-binding opt-out (owner decision, 2026-10-21: encode by default).
- Splitting a path value on `/`.

## Decisions

### D1. Three cases, decided by the prefix

A single `encodeURIComponent` would break two stored shapes:
- `tel:+1…` becomes `tel:%2B1…`, which RFC 3966 does not allow, since a global number starts with a literal `+`.
- The `https:` + `//host/path?…` widget would lose its query.

So the prefix decides:

| Prefix | The value is | Encoded | Kept |
|---|---|---|---|
| exactly `http:` / `https:` / `http://` / `https://` | the rest of a URL | whitespace, controls, `"` `<` `>` `\` `^` `` ` `` `{` `|` `}`, non-ASCII | everything else, `%` and the delimiters included |
| starts with `data:` | an image payload, kept as written | nothing (the image-source guard admits only base64) | everything |
| another bare scheme (`mailto:`, `tel:`, `sms:`…) | the scheme's address | every character not kept: the above plus `%` `?` `#` `&` `[` `]` | letters, digits, `-._~@+:;,=!$'()*/` |
| anything longer (`…?seed=`, `…/u/`) | one component | everything `encodeURIComponent` encodes | `A-Za-z0-9-_.!~*'()` |

**Why it is decided by the prefix alone.** The prefix is author-written; the value is data. A rule that inspected the value, such as "already looks encoded", would let data choose its own treatment.

**The web-scheme case keeps `%`.** A value that is the rest of a URL may carry its own escapes (`?q=a%20b`), and re-encoding them would double-encode. Since it keeps every delimiter, data can still restructure the URL behind a bare `https:`. That is inherent: such an author handed the value the whole URL, exactly as binding the URL whole does.

**The address case encodes `%`.** An address carries no escapes of its own, so a literal `%` in data must not form one.

**Revision after the PR review (2026-10-21).** Two findings were regressions compared with raw concatenation, and both cases were added.
- **`https://`** is a web prefix too, as `https:` is. A component encoding of `example.com/a/b?c=1` turned it into one dead host (`example.com%2Fa%2Fb%3Fc%3D1`).
- **A `data:` prefix keeps its value.** Component encoding turned the base64 `+ / =` into escapes, and the image-source guard then dropped the `src` without a diagnostic. Keeping the value raw is safe: the guard admits a `data:` source only when it is a base64 image, and a `data:` href never passes.

The bridge copy gains the `//` case only, because a `data:` prefix never composes a link.

### D2. One core helper, mirrored in the bridge

`packages/core/src/contract/url-values.ts` exports `composePrefixedUrl(prefix, value)` internally, not from the package root. `compile.ts` and `format.ts` call it. It is runtime-neutral: a character loop over code points, with UTF-8 percent-encoding via `encodeURIComponent` per character, and no `URL` global.

**The bridge** carries a compact copy in `cellNode`, inside the size budget. An agreement test drives the core renderer and the bridge preview over the same prefixes and values (query, bare `mailto:`/`tel:`, bare `https:`, non-ASCII, empty) and requires identical `href`s, as the image-place agreement suite does.

**Rejected: exporting the helper publicly.** No host needs it, and the export snapshot would grow for nothing.

### D3. Steering says it once, where agents read it

The rule is stated once, as the exported core constant `PREFIX_ENCODING_RULE`, beside `LABEL_STYLE_RULE` and `FIELD_ORDER_RULE`. Four places derive from it: the guide's `ATTR PREFIX` line in `guide.ts` and in webmcp's copy (each guide's test checks for it), the card and table `links` descriptors, and the designer's prefix field title. Because of the designer title, the designer ships a patch too. The constant scopes the guarantee to each case: data cannot restructure a URL behind a query or path prefix, and cannot add fields behind a bare `mailto:`/`tel:`. Behind a web prefix the value chooses the URL.

The corpus changes for `get_authoring_guide`, `list_widgets` and the app template, and gains prefix cases.

## Risks / Trade-offs

- **[A path value with `/` behind a path prefix becomes one segment (`a%2Fb`)]** → No stored widget has a path prefix. The docs say to bind the whole URL for multi-segment paths.
- **[A pre-encoded value behind a query prefix is double-encoded]** → Data should be raw. The guide states the value is encoded, so agents pass raw values. The bare web-scheme case keeps `%` for whole-URL remainders.
- **[Bridge drift]** → The agreement test (D2).
- **[Template budget]** → The copy fits: 44,992 of 45,056 raw bytes (64 B left), 11,774 of 13,312 gzipped. The date change queued next adds bridge code, so it must revisit the raw budget with its own rationale.

## Migration Plan

No stored data changes. The 11 production prefixes keep working: only spaces in phone numbers change bytes (`%20`).
1. Apply on `bug/encode-prefixed-url-values`.
2. Deploy to staging and check a keyed render with a query-prefixed image.
3. The demo seed gains `person-card-widget` (owner request). Its avatar, phone, address and website cover the query-prefix, address and whole-URL cases in a host.
4. Merge into `staging`. It rides the 0.15.0 release with the date and widget-theme changes, and `Widgentic.Mcp` follows the pin.

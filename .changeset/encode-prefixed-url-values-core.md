---
"@widgentic/core": patch
---

A value composed behind an author's URL prefix is now percent-encoded, so data can no longer restructure a URL whose shape the prefix fixes. This applies to a template `{ bind, prefix }` and to a `hints.links` prefix string on cards and tables. The prefix decides how:
- **Anything longer than a scheme** (`https://api.dicebear.com/9.x/initials/svg?seed=`): the value is one URI component, encoded as `encodeURIComponent` does. `Ada & Lin?x=1` becomes `Ada%20%26%20Lin%3Fx%3D1`; before, its `&` started a new query parameter.
- **A bare `mailto:` or `tel:`** (any bare scheme other than the web ones): the value is the address. `ada@example.org` and `+15551234` are unchanged, a space becomes `%20`, and `?`, `#`, `&` and `%` are encoded, so a value cannot add `?subject=`.
- **Exactly `http:`, `https:`, `http://` or `https://`**: the value is the rest of a URL. Spaces, control characters, quotes, `<>\^`, backtick, braces, `|` and non-ASCII are encoded, and its delimiters and escapes are kept.
- **A `data:` prefix**: the value is kept as written. The image-source guard admits only base64.

Non-ASCII characters are encoded as UTF-8. The new constant `PREFIX_ENCODING_RULE` states the rule, and every surface that documents a prefix derives from it. The `hints.links` analyzer checks the encoded href. Whole URLs bound with no prefix are unchanged.

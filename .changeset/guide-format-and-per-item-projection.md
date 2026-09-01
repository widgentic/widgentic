---
"@widgentic/mcp": minor
---

The authoring guide teaches the `format` transform and per-item array projection.

`rules.template.forms` gains a `FORMAT` line documenting `{ bind, format }` with its number,
currency and date specs and the currency recipe that motivated it (a numeric-string price as
COP with 0 decimals), plus an explicit one-transform-per-value line. The recipe's example outputs
are rendered by the engine at guide-build time, never typed. Every
bound in that text — the decimals range, the currency-display vocabulary, the date tokens, the
pattern length cap and the default locale — is READ from the constants the validator enforces,
so a change to the engine cannot leave the guide lying.

The action-output rules now state that a `map` over an ARRAY response resolves against each
item and projects the array of per-item results (pair it with `replace` or `patch`), that a `"."`
target selects first (alone it is the projection; beside other entries it names the value they
map, so an enveloped list projects per item), that index-addressed sources still address the
response root, and — on the BIND line — that a text bind may carry `map` (value → label) or
`format`, never `prefix`.

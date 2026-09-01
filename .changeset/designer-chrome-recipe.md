---
"@widgentic/designer": minor
---

`chromeReferences(prefix = "--host")` — the full `chrome` map of `var()`
references over `CHROME_TOKENS`, the return trip of `chromeCss`: paint the page
with the derived palette, hand the designers the references, and they match by
construction — an explicit scheme toggle reaches MOUNTED designers through the
cascade with no remount and no event. Spread-override individual entries
(`{ ...chromeReferences(), font: "..." }`). Caveat, stated in the docs: a
reference to a property the page never defines is invalid at computed-value
time and does not fall back to the built-in defaults — always pair the map
with `chromeCss` under the same prefix.

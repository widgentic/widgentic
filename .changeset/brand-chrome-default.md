---
"@widgentic/designer": minor
---

The designers now wear the widgentic palette by default, light and dark.

Every colour sits on the logo mark's hue and is contrast-checked in both
schemes: text pairs at WCAG AA (4.5:1), and the borders that identify an
input, a focused tag or a banner at 3:1 — so `border`, `accent-line` and
`danger-line` are noticeably stronger than before. Typography is unchanged
(system stacks, 13/12/11px); radii move to 4/6/8px.

**This is a visual change for hosts that pass no `chrome`.** Nothing in the
API changed and nothing stops compiling. There is one default palette and no
second one to fall back to: a host that wants a different look passes its own
values through `chrome`.

Also new: `CHROME_DEFAULTS` (the applied palette — the injected stylesheet is
generated from it, so a host painting its page from the export cannot drift)
and `chromeCss(palette, options?)`, which renders a palette as light and dark
custom-property blocks under a prefix you choose.

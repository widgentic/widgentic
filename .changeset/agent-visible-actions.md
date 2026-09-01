---
"@widgentic/mcp": minor
---

Agents can discover shared actions: a new `list_actions` tool serves the
principal's saved actions as their CONTRACT — name, label, description, kind,
and for http the method and the input/output schemas (a prompt entry instead
carries `binds`, the data paths its text references — a prompt ref takes no
input mapping) — so a draft can bind one with `action: { "ref": "<name>" }`
instead of guessing a name or inventing an inline definition. The URL, headers and query stay on the server: a binding
needs none of them, and a read-only key travels into prompt-injectable hosts.
Wire it with the new `sharedActions` option (lazy; omitted means an empty list).

`get_authoring_guide` gains a `sharedAction` section — the entry shape, the
action name pattern (stricter than other identifiers, read from the constant
that enforces it), the Actions-section import path, and the rule that an action
the user has not saved is described for the designer, never drafted with an
invented URL. Its `limits` now also publish `maxSchemasPerUser` and
`maxActionsPerUser`.

Fix: the `node:http` authoring adapter now contains a host `resolveContext`
that throws or rejects — a store rejection keeps its mapped status and code,
anything else answers the surface's structured `INTERNAL` with the trace on the
log sink — instead of letting the rejection escape into the host's server.

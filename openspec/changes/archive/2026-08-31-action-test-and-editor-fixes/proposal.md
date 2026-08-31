# Why

Live testing on widgentic.dev v70 (user findings, 2026-08-31): a standalone
http action whose API returns a non-object cannot pass its test call — the
surface answers `INVALID_ACTION_OUTPUT: merge needs an object response and
object data` — and since the app requires a passing test before save, such an
action cannot be saved at all.

The root cause is a category error in `testHttpAction`: it applies the output
fold with no binding (`applyOutput(http, undefined, {}, body)`), so the
binding-level default `merge` kicks in. But `mode` and `map` belong to a
WIDGET'S BINDING — how one widget folds the response into its own data,
authored later, per widget — not to the standalone action being tested. The
action's own output contract is its schema. Testing a standalone action must
therefore validate the response against that schema and apply no fold; the
merge-needs-an-object rule still fires where it is real, at widget-binding
time.

Two designer polish items from the same session ride along: the action
editor's Kind and Method selects each sit on their own row (they belong
together), and — in both hosts' key forms — nothing here; the key-form
alignment is the app's own CSS and is fixed in `widgentic/apps`.

# What Changes

- **`testHttpAction` stops applying a binding fold**: the response is
  validated against the action's output schema (and projected only if a
  binding were supplied — the standalone test supplies none), never merged
  into stand-in data. A GET returning an array or scalar now tests green when
  it matches the schema; a widget binding it with `merge` still fails at
  binding time, where the mode is actually authored.
- **Action editor**: Kind and Method share one row for http actions.
- Changeset: patch for `@widgentic/mcp` and `@widgentic/designer` (linked —
  both land on the same number).

A fourth finding from the same session: the secret-value refusal says
"at least 8 bytes", which reads as jargon (bytes vs characters), and the name
field gives no hint of its lowercase rule until the server refuses. The
messages now say characters with the byte measure explained, and the docker
example's form enforces the name pattern client-side with hints — the app's
own form gets the same treatment in `widgentic/apps` (v71).

# Capabilities

## Modified Capabilities

- `authoring-api`: the test-call requirement states what "output validation"
  means for a STANDALONE action — the schema, not a widget's fold.

# Impact

- `packages/mcp/src/server/actions.ts` (+ its tests), `packages/designer/src/action-editor.ts`.
- After release: `widgentic/apps` bumps and deploys (v71, together with its
  own key-form CSS fix); the docker example needs nothing (ranges rewrite at
  release).

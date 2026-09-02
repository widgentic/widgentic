## Why

The first live use of the WebMCP status line read `no agent-capable browser` to a person
on a phone who had never heard of WebMCP — a fault message for a normal browser. The
signal worth showing is the positive one: in a browser whose agent can use the designers,
say so; everyone else should see the page exactly as before.

## What Changes

- `examples/shared` `describeAgentTools` returns a sentence only when registration
  succeeded ("WebMCP tools are available in this browser — your agent can draft into
  these designers; you save.", with a refused count when any registration was refused) and
  an empty string otherwise; both example pages therefore show nothing in ordinary browsers.
- The package README and the docs page show the same positive-only pattern in their
  snippet; the self-host README and TESTING.md wording follow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `self-host-example`: "The app mounts the authoring surface and the designers" — the
  status is positive-only; the "No agent-capable browser" scenario shows nothing and a new
  scenario states the positive sentence.

## Impact

`examples/shared/webmcp.ts` + its test, `examples/docker/README.md`, `packages/webmcp/README.md`
(docs only, no package release), `docs/develop/co-author-with-an-agent.mdx`, `TESTING.md`.

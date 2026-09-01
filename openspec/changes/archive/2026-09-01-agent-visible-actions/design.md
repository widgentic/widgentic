# Design — Agent-visible shared actions

## Context

See proposal.md — Why. What shapes the approach:

- `list_schemas` is the template to copy, and it is three small pieces:
  `LIST_SCHEMAS_TOOL` in `packages/mcp/src/server/definitions.ts`, `handleListSchemas`
  in `handlers.ts` taking a LAZY `() => Promise<StoredSchemaEntry[]>` source and
  returning `{ schemas, rules }`, and one `server.registerTool` call fed by an
  `options.schemas` source the edge wires to `store.schemas(principalId)`.
- `StoredAction` (`packages/core/src/actions/types.ts`) is `{ name, label?, description?,
  definition }` — structurally the same as `StoredSchema`, with `definition` in place of
  `schema`. `store.actions(principalId)` is already on the READ interface, so nothing in
  the store port changes.
- Composition already reads actions, but conditionally (only when some widget binds by
  `ref`) and it keeps only the definitions, keyed by name, behind an `ActionSource.resolve`
  — labels and descriptions are dropped. So the listing cannot reuse the composed catalog;
  it needs its own lazy source, exactly as schemas do.
- Action names obey `ACTION_NAME` (`/^[a-z][a-z0-9-]{0,63}$/`, shared with secrets), which
  is STRICTER than the `SAFE_IDENTIFIER` widgets, themes and schemas use. A guide section
  that quoted the wrong constant would teach names the store then refuses.
- The guide is `buildAuthoringGuide()` in `guide.ts`, a literal object whose facts are read
  from the constants that enforce them. `sharedSchema` sits between `widget` and `theme`;
  the schema steering appears in four places (the section, `workflow.related`, the
  `dataSchemaRef` field note, and the `rules.template.dataModeling` tail), each of which
  needs its action twin.
- `tools/docs-generate.ts` renders the authoring-contract page by reading NAMED guide keys
  through `dict()`/`str()`, which throw on a missing key but silently ignore a key nobody
  reads. A new guide section that the generator is not taught about simply never appears in
  the docs.

## Goals / Non-Goals

**Goals:** an agent can see what shared actions a user owns and bind one correctly on the
first try; the guide teaches the standalone entry end to end (shape, name rule, import
path, binding forms); the listing leaks nothing an author put in a URL, header or query.

**Non-Goals:** any write path for actions (there is none by design); exposing a single
action in full (no `get_action`); changing the action model, the binding grammar or
`execute_action`; teaching the agent to author secrets. The apps repo's adoption of the
eighth tool is a downstream bump, not part of this change.

## Decisions

**A1 — The listing is the contract, not the transport.** Entries carry `name`, `label?`,
`description?`, `kind`, and for http `method`, `input`, `output`. They do NOT carry `url`,
`headers` or `query`.
*Why:* an agent needs none of them — a binding is `{ ref, input?, output? }`, and the
server resolves the definition from the store at execution. Meanwhile a read-only key is
explicitly designed to travel into prompt-injectable hosts, and `headers`/`query` values
are "literal strings or `{ secret: <name> }`": the secret reference is a name (harmless),
but the LITERAL is whatever the author typed — including, for an author who did not know
better, a bare token. Withholding the transport costs the agent nothing and removes a
class of leak entirely.
*Alternative considered:* list the URL and redact only header/query literals. Rejected —
it keeps a redaction rule to maintain forever, and a URL can carry a token in its own query
string, so the redaction would have to reach inside the URL too. "The transport never
leaves the server" is one rule with no edges.
*Consequence to accept:* an agent cannot tell the user which host an action calls. The
description field is where an author says what the action does, and the designer shows the
truth.

**A2 — `method` is contract, not transport.** It stays in the listing because a widget's
`load` binding accepts only http `GET`: an agent that cannot see the method cannot tell
whether an action is loadable, and would guess. It reveals nothing about the target.

**A3 — Its own lazy source, mirroring `schemas`.** `createWidgenticServer` gains
`sharedActions?: () => Promise<StoredAction[]>` (`actions` already names the execution
binding source); the handler reads it per call. Not the
composed `ActionSource` (A-context: conditional, definition-only), and not an eager read at
construction — per-request composition with no caches is the standing rule, and a listing
that read at construction would serve one principal's actions to another.

**A4 — The result carries its own `rules` string, as `list_schemas` does.** The wire
description steers the agent BEFORE it calls; the `rules` field in the result steers it
while it drafts, which is when it decides between a `ref` and an invention. Both texts say
the same thing, and both derive from the same source in the module rather than being typed
twice.

**A5 — The guide gains `sharedAction`, and the three steering twins.** The section slots
between `sharedSchema` and `theme`. `workflow.related` names `list_actions`; the template
`actions` rules point at it for discovery; the binding note states the "describe, don't
invent" rule. The name pattern is read from `ACTION_NAME.source` (A-context), never typed.

**A6 — Missing limits are added rather than left.** `maxSchemas` and `maxActions` join the
published limits. An agent that drafts a fifth shared action for a user already at the cap
produces a refusal the user has to interpret; the cap is derived from the same
`DEFAULT_LIMITS` the other four already read, so this is one line each and no new source of
truth.

**A7 — The docs generator is taught the new section in the same change.** Its readers throw
on a key they expect and miss, but drop one they were never told about, so an untaught
generator silently ships a docs page that omits the whole shared-action contract. The
generated MCP-tools page and the README row also stop saying "seven".

**A8 — The `execute_action` requirement loses its ordinal.** It reads "a seventh tool";
with a discovery tool added beside `list_schemas` that is simply wrong, and the repo's rule
is that a spec passage contradicted by reality gets fixed, not left. The delta carries the
requirement whole (all nine scenarios, original titles) to change two words — the OpenSpec
validator treats an omitted scenario as a deletion.

**A10 — The source yields `StoredAction[]`; the HANDLER projects (decided during apply).**
The first task sketch had the source yield entries already reduced to the contract, which
would have put the withholding of `url`/`headers`/`query` in every host's wiring — a leak
one forgotten `.map` away, in the one place no package test can see. The source is
therefore the store's own `actions(principalId)` shape and the projection happens once, in
the handler, where A1's scenario pins it. Hosts wire a reader and cannot get it wrong.

**A11 — A prompt entry's contract is its bound paths (decided in review).** A prompt
takes no input mapping — `validateActionBinding` refuses one — and its `{ bind }`
segments resolve against the BINDING widget's own data. Listing a prompt as bare
`{ name, kind }` left the agent two failure modes: draft an `input` (refused on import)
or bind it to a widget missing the path (a silently empty segment in the proposed
message). Entries therefore carry `binds` — the paths the text references, no literals —
and the description and rules state that a prompt ref takes no input mapping. The paths
are contract, not transport.

**A12 — The listing degrades like the store layer (decided in review).** `sharedActions`
is host-supplied and only compile-time typed; one malformed entry must not turn the other
49 into a protocol error. The handler drops entries whose `definition` is not a plain
object — the same skip-don't-fail rule the stores follow on read.

**A9 — The adapter contains a failing host callback.** `resolveContext` is awaited outside
the adapter's only try/catch, so a host whose store is unreachable gets an escaped
rejection: on the widgentic.dev entry that lands in a bare `.catch(() => res.writeHead(500))`
with no body and no log line, and on a host that forgot the catch it is an unhandled
rejection. Wrapping it makes the answer the same structured `INTERNAL` refusal the surface
already returns for its own failures, with the trace going to `deps.log`. The refusal says
nothing about the host's failure — a store error text could name infrastructure.

## Risks / Trade-offs

- [An agent asks for a URL it cannot see and hallucinates one in its explanation to the
  user] → the `rules` text states plainly that the listing is the contract and that the
  designer shows the target; the description field carries the author's own summary.
- [Eight tools crowd the model's tool list] → the four discovery tools are already there;
  `list_actions` is called only when the user mentions an action, and its description says
  so. The alternative — folding actions into `list_widgets` — would make every render
  listing heavier for a case most conversations never hit.
- [The apps repo's "keyless 7 tools" verification step silently passes on 8] → it asserts a
  count; the RUNBOOK entry for the adopting deploy names the change, and this repo's
  `TESTING.md` is updated in the same change.
- [A guide section added without its generator block ships invisible] → A7 makes the
  generator part of the same task, and the docs test that counts pages and headings fails
  loudly if the tool list drifts.

## Migration Plan

Additive: a new tool, a new guide section, two new published limits. No stored shape
changes, no client changes, nothing to migrate. A host that does not wire the `actions`
source serves an empty list, which is the anonymous behavior already specified.

Release as a MINOR of `@widgentic/mcp` (new tool surface); the apps repo bumps and deploys
the eighth tool on its own schedule, updating its verification step from 7 to 8.

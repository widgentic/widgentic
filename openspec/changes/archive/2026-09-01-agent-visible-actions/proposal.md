## Why

An agent can discover a principal's shared **schemas** (`list_schemas`) but not their shared
**actions**, even though the template DSL binds one by name (`action: { "ref": "<name>" }`)
and the store has held `StoredAction` entries since the widget-actions change. Asked to
"add a refresh button using my weather action", an agent today cannot see that the action
exists, cannot learn what arguments it takes, and `get_authoring_guide` never shows it the
standalone entry shape or where a person imports one — so it either drafts a `ref` to a
name it guessed or invents an inline http definition with a URL and credentials it has no
way to know. Both outcomes land on the user as a broken import. Found live on 2026-08-31
testing v70; the same session found the authoring adapter letting a host's failing
`resolveContext` escape as an unhandled rejection.

## What Changes

- **New `list_actions` tool** (the eighth), parallel to `list_schemas`: returns the
  presented key's stored shared actions so an agent can bind one by name. Each entry
  carries `name`, `label?`, `description?`, `kind`, and for `http` the `method` and the
  `input`/`output` schemas.
- **The listing is the CONTRACT, never the transport.** `url`, `headers` and `query` are
  deliberately withheld: an agent needs none of them to write a `ref` binding, and a
  read-only key travels into prompt-injectable hosts — an author who inlined a token in a
  fixed query parameter must not have it read out through a listing. Consistent with
  `execute_action`, where a request may never supply a URL, method, headers or schema.
- Anonymous or unknown keys see an empty list, never an error; the store is read when the
  tool is called, never at server construction.
- **`get_authoring_guide` gains the standalone-action section**: the entry shape
  (`{ name, label?, description?, definition }`), the import path (the Actions section of
  the designer), the binding forms an agent writes (`action: { ref, input?, output? }` on
  an element and the widget-level `load`), and the steering that closes the loop —
  discover with `list_actions`, reference by name, and when nothing suitable exists
  DESCRIBE the action for the user to author and test in the designer rather than
  inventing a URL or a secret.
- **Polish, guide limits:** the guide publishes `maxWidgets`, `maxThemes`, `maxEntryBytes`
  and `maxTemplateNodes` but not `maxSchemas` or `maxActions` — an agent drafting shared
  entries cannot see the cap it is drafting against. Both are added, derived like the rest.
- **Polish, adapter:** a host `resolveContext` that rejects is answered as a structured
  `500` through `deps.log` instead of escaping the adapter.
- **Polish, docs:** the README capability row and the generated MCP-tools page say "seven
  tools" and the row's list omits `execute_action` — both are corrected and derived where
  possible; the `mcp-server` spec's "a seventh tool" ordinal for `execute_action` stops
  being a count.

Not breaking: `list_actions` is additive, the guide gains a section, and no existing tool's
input or output changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: a new requirement for the `list_actions` tool; the authoring-guide
  requirement gains the standalone-action shape, its import path and its steering; the
  action-execution requirement drops the stale ordinal now that a tool sits between.
- `authoring-api`: the Node adapter requirement gains the `resolveContext` failure rule.

## Impact

- `packages/mcp/src/server/definitions.ts` — a tool constant beside `LIST_SCHEMAS_TOOL`;
  `handlers.ts` — a handler over a LAZY source, as `handleListSchemas` is; `server.ts` — an
  `actions?: () => Promise<…>` option and the registration; `index.ts` — the barrel.
- `packages/mcp/src/server/guide.ts` — a `sharedAction` section plus the action twins of the
  three places that steer to `list_schemas` (`workflow.related`, the binding rules, the
  data-modeling tail), and the two missing limits.
- `packages/mcp/src/authoring/node.ts` — `resolveContext` failure handling.
- Wiring that passes the new source at the edge: `examples/mcp-server`, `examples/docker`
  (and, downstream, the apps repo's MCP edge).
- `tools/exports.test.ts` snapshot (two new names); `tools/docs-generate.ts` — the `TOOLS`
  array, the tool-count frontmatter, and an authoring-contract block for the new guide
  section (its `dict()`/`str()` readers drop what they are not told to render).
- `README.md` capability row; the hand-written `docs/develop/mcp-tools.mdx` and
  `docs/design/authoring-with-an-agent.mdx` tool lists; `TESTING.md` verification-log
  entry; a changeset.
- Downstream (not in this change): every "keyless 7 tools" verification step becomes 8 —
  this repo's `TESTING.md` and, in `widgentic/apps`, `CLAUDE.md` and `RUNBOOK.md`. The apps
  repo adopts on its next bump.

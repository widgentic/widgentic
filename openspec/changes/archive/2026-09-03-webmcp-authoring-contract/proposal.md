## Why

First round of live testing in ChatGPT Desktop's browser, two findings. (1) The agent
used the WebMCP tools readily but drafted worse widgets than it does after reading the
MCP `get_authoring_guide`: the tool descriptions named shapes but not the DSL rules
(`map`, `prefix`, `format`, paths, styles, the data schema), so the agent guessed. (2) The
agent, told to "create a widget", loaded the draft through our tools and then pressed the
Save control with the host's own page-automation tools — a full write path under the
person's session that our tools never offered and cannot prevent. Both go into the
package and the docs before the second round.

## What Changes

- Two reference tools, always present: `<prefix>_authoring_guide` (the full authoring
  contract, mirroring the MCP guide's structure and derived from core's constants, with the
  workflow rewritten for the browser) and `<prefix>_widget_definition_check` (validate a
  definition without touching the designer; same errors and diagnostics the load would
  give). Fourteen tools in all.
- Every editing tool's description carries a DSL cheat sheet — forms, the three transforms
  and their one-per-value rule, forbidden tags/attributes, `.wg-` styles with tokens, the
  required descriptor fields, identifier rules — and names the guide and check tools. The
  theme and schema load descriptions gain the token families and the schema subset.
- The guide and the descriptions tell an agent that can operate the page to leave Save to
  the person unless asked; the docs (package README, co-author page, host matrix, self-host
  README) state plainly that a host agent may press Save itself and that our tools cannot
  prevent it — the draft is visible before it happens.
- Duplication accepted for now: the guide text is copied from the MCP package (which is
  Node-only) with the two store constants restated; a shared browser-safe guide module in
  core is queued, not done.

## Capabilities

### Modified Capabilities

- `designer-webmcp`: "Designer tools are derived from the designer handles" (tool set,
  descriptions teach the contract), "The token reference tool derives from the exported
  specs" (the guide and check tools), "Agents edit, people save" (the host-automation
  statement).

## Impact

`packages/webmcp/src/guide.ts` (new), `reference-tools.ts`, `widget-tools.ts`,
`entry-tools.ts`, `tools.ts`, tests; package README; `docs/develop/co-author-with-an-agent.mdx`,
`docs/how-it-works/host-matrix.mdx`; `examples/docker/README.md`; root README; TESTING.md log;
changeset minor for `@widgentic/webmcp` (0.2.0). Downstream: apps and examples bump to
`^0.2.0`; demo and widgentic.dev redeploy.

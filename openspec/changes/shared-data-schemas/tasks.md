# Tasks — Shared data schemas

## 1. Store: the entity and its rules

- [x] 1.1 `StoredSchema` type (`{ name, label?, description?, schema }`); `schemas(principalId)` on the `WidgetStore` port; `putSchema`/`removeSchema` on `WritableWidgetStore`; `maxSchemas` in `StoreLimits` (default 50)
- [x] 1.2 `checkStoredSchema` in validate.ts: identifier charset, plain-object `schema`, byte limit — same skip-with-diagnostic posture as widgets/themes
- [x] 1.3 Ref rules in `checkStoredWidget`: `dataSchemaRef` string in the charset; both-present → `INVALID_SHAPE`; write-time existence check (`UNKNOWN_SCHEMA`) where the store can see both collections
- [x] 1.4 `removeSchema` in-use guard: refuse `SCHEMA_IN_USE` naming referencing widgets (memory + file + Cosmos identically)
- [x] 1.5 Memory + file implementations (`<dir>/<principal>/schemas/*.json`); Cosmos adapter `schema:<name>` documents
- [x] 1.6 `composeCatalog` resolves refs into registered descriptors; dangling ref → skip widget with diagnostic; registered descriptors never carry a ref (pinned by test)
- [x] 1.7 Contract suite: schema round-trip, limits, ref lifecycle (write refused / in-use refused / dangling skipped / resolution + propagation on recompose) — run against memory AND Cosmos
- [x] 1.8 Store tests green; typecheck green

## 2. Designer: the third sibling and shared mode

- [x] 2.1 `schema-designer.ts`: `createSchemaDesigner` — identity fields + schema builder + parse-gated JSON pane (Tree/JSON tabs, one view at a time), `readOnly`/`setReadOnly` (inert section bodies, same mechanism), `loadSchema` re-validating and never clobbering on failure, `getSchema` in the store shape
- [x] 2.2 `defineSchemaDesignerElement` (default `widgentic-schema-designer`), explicit registration only, `widgentic-change` events; export all from the `./designer` entry
- [x] 2.3 Widget designer: `options.schemas`; Data schema section gains inline/shared mode — shared shows the picked schema read-only, draft carries `dataSchemaRef`, never both; switching back restores inline editing
- [x] 2.4 Local resolution: dataExample/sample validation and the schema-driven data form resolve the ref from `options.schemas`; unknown ref → diagnostic at the section; loading a ref-carrying widget selects shared mode; export carries the ref as authored
- [x] 2.5 Designer tests: schema designer (projections, invalid loads, round-trip, read-only); widget designer shared mode (ref set/cleared, resolution diagnostics, export shape); existing suites stay green

## 3. App: the Data schemas section

- [x] 3.1 `/api/schemas` routes (list/put/delete), session-only like widgets/themes; store rejections surface as structured errors (422 family; `SCHEMA_IN_USE` names the widgets)
- [x] 3.2 Data schemas tab: list + hosted schema designer with the established view→edit state machine (select = read-only + Edit/Delete; Edit = Save/Cancel; Save-to-my-catalog new-only)
- [x] 3.3 Widget designer receives the principal's schemas (`options.schemas`), refreshed by the tab-return remount contract
- [x] 3.4 App API tests: schema CRUD, session-only writes, in-use deletion refusal naming widgets, edit-propagates-through-compose (save schema → recompose → updated validation)

## 4. Verify and ship

- [x] 4.1 Full gate: `npm test` + typecheck + `npm run build`; change validates strict
- [x] 4.2 Live browser sweep on the rig (:3002 dev-login): create schema → reference from two widgets → edit schema → both re-validate; deletion refusal shows the widget names; read-only flows
- [x] 4.3 End-to-end through MCP: saved ref-carrying widget renders through `mcp:http` with the resolved schema (dotted-path validation errors prove resolution)
- [x] 4.4 Docs: README (schemas section, designer surface), TESTING (new routes/flows if runbook-worthy)
- [x] 4.5 Deploy vNN per the redeploy contract; verify live; commit and push

## 5. Agent discovery: list_schemas + guide (user follow-up)

- [x] 5.1 Delta spec: ADDED "Schema listing tool"; MODIFIED "Authoring guide tool" (dataSchemaRef in the entry shape, reference-over-reconstruction steering via list_schemas)
- [x] 5.2 `definitions.ts`: `LIST_SCHEMAS_TOOL` with the name-over-copy steering in its description; export from the base entry
- [x] 5.3 `handlers.ts` + `server.ts`: `handleListSchemas` (SDK-free, async source); assembly takes a lazy `schemas` provider so renders never pay the read; `apps/mcp-server/http.ts` wires `store.schemas(principal.id)` per request
- [x] 5.4 `guide.ts`: widget entry documents `dataSchemaRef` (ref XOR inline); shared-schema rule in dataModeling steering to list_schemas
- [x] 5.5 Tests: 6-tool listing; list_schemas round-trip over the protocol (entries + empty for anonymous); wire description carries the steering; lazy-provider test (render reads nothing); guide facts updated; stdio banner lists all six
- [x] 5.6 Full gate; deploy v27; verify live tools/list + anonymous empty listing; docs (README tool list); commit and push

## 6. Schema designer io (live-test finding: agent-drafted entry had nowhere to go)

- [x] 6.1 Deltas amended: schema designer gains Import/Export (import first, re-validated, export read-only-operable); the guide documents the schema entry shape + its import path; design D5 revised
- [x] 6.2 `schema-designer.ts`: Import section (textarea + button + errors via `checkSchemaEntry`/`loadSchema`) and Export section (`wgd-view-only`), matching the widget designer's io shape
- [x] 6.3 `guide.ts`: `sharedSchema` section — entry shape, import path (Data schemas section at widgentic.dev), workflow mention
- [x] 6.4 Tests: the agent's actual `person` entry imports verbatim; invalid imports leave the entry untouched; section order; export operable read-only; guide facts
- [ ] 6.5 Gate; rig check pasting the real example; deploy v28; verify live guide; commit and push

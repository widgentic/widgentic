# Tasks — Template bind transforms

## 1. DSL: types, validation, interpretation

- [x] 1.1 `src/templates` types: attr value union gains `{ bind, map, default? }` and `{ bind, prefix }`
- [x] 1.2 Validator: accept the two forms; reject with dotted paths — non-object/non-string-valued `map`, non-string `default`/`prefix`, `map`+`prefix` together, transform without `bind`
- [x] 1.3 Interpreter: map = String(resolved) selects a key → authored literal, miss → `default` ?? ""; prefix = literal + value only when the resolved value is a non-empty string, else "" (never a bare prefix)
- [x] 1.4 Safety: composed/mapped values run the existing URL guard unchanged (tests: mailto kept, authored `javascript:` prefix dropped like any bound scheme)
- [x] 1.5 Template tests: both transforms across render + serializer; emptiness rules; validation rejections; bounded interpretation untouched

## 2. Designer: attr rows author the transforms

- [x] 2.1 Attr row (bind mode): optional `prefix` input; map editor (record-row idiom: value → literal rows + `default`) inside the attr group
- [x] 2.2 Round-trip: loading transform-carrying templates populates the controls; edits preserve sibling fields; export unchanged
- [x] 2.3 Designer tests: author both transforms from the tree; load → edit → export pins; existing suites green

## 3. Guide and agents

- [x] 3.1 `guide.ts`: the two forms in rules.template.forms with the motivating recipes (status→`wg-status-*`; `mailto:`/`tel:`)
- [x] 3.2 Guide-simulation fixture grows a widget using BOTH transforms; store-write + designer-import pass unchanged
- [x] 3.3 Guide tests for the new prose; wire steering not needed (no new tool)

## 4. Verify and ship

- [x] 4.1 ORDERING: archive `shared-data-schemas` FIRST (this change's designer/guide deltas build on its pending text)
- [x] 4.2 Full gate; strict validation
- [x] 4.3 Rig: author a person card with status→class map and mailto/tel links; render through mcp:http; iterate with the user's live person widgets
- [x] 4.4 Docs: README's DSL row stays accurate (bind/each/when; attr forms live in the guide, which is the agent-facing doc); deployed v30 per the contract; live guide verified (ATTR MAP / ATTR PREFIX / exclusivity on production); committed and pushed

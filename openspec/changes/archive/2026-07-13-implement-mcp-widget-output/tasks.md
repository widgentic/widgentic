## 1. Module scaffolding

- [x] 1.1 Create `src/mcp/` with `index.ts` (public exports), `types.ts` (structural MCP shapes + constants), `emit.ts` (`toWidgetResult`, `toTextResult`), `extract.ts` (`extractWidgetPayload`, `isWidgetResult`), and `capability.ts` (`hostSupportsWidgets`, `declareWidgetCapability`)
- [x] 1.2 Add `./mcp` entry to `package.json` `exports`

## 2. Types and constants

- [x] 2.1 Define structural types: `McpToolResult`, `McpTextContent`, `McpResourceContent`, `McpContentBlock` (open unions with index signatures), `McpCapabilities` — no SDK imports
- [x] 2.2 Define constants: `WIDGENTIC_MIME_TYPE`, `WIDGENTIC_URI`, `WIDGENTIC_CAPABILITY`, `WIDGENTIC_VERSION`

## 3. Emission

- [x] 3.1 Implement `toTextResult(payload)`: `meta.title` first line + pretty JSON of `data`, `String(data)` fallback on serialization failure, single text block
- [x] 3.2 Implement `toWidgetResult(payload, options?)`: text fallback block + widgentic resource block (JSON payload, `options.uri`/`options.text` overrides), degrade to text-only shape when the payload cannot serialize

## 4. Extraction and negotiation

- [x] 4.1 Implement `isWidgetResult(result)` and `extractWidgetPayload(result, options?)`: first widgentic-mime block, `parseJson` + `validateWidgetPayload` (with `options.knownKinds`), three-state result, never throws on garbage
- [x] 4.2 Implement `declareWidgetCapability(capabilities?)` (non-mutating merge) and `hostSupportsWidgets(capabilities)` (presence check, total)

## 5. Tests

- [x] 5.1 Emission tests: every scenario in the delta spec for `toWidgetResult`/`toTextResult` (resource block shape, fallback text equality, uri/text overrides, unknown-field round trip, circular-data degradation)
- [x] 5.2 Extraction tests: round trip, `{ found: false }` for non-widget/garbage results, `INVALID_JSON`/`MISSING_FIELD`/`UNKNOWN_KIND` errors, first-block-wins
- [x] 5.3 Capability tests: declare→detect round trip, preservation/non-mutation, malformed inputs return false
- [x] 5.4 Type tests (`types.test-d.ts`): result/extraction discriminated narrowing, structural MCP types accept unknown fields
- [x] 5.5 End-to-end integration test through package entries: adapter → `mapToWidget` → `toWidgetResult` → `extractWidgetPayload` (with `catalog.kinds()`) → `catalog.render` → `renderToHtml`, plus the incapable-host path (`hostSupportsWidgets` false → `toTextResult`)

## 6. Verification

- [x] 6.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 6.2 Confirm `widgentic/mcp` resolves via package exports (import through the package entry in a test)

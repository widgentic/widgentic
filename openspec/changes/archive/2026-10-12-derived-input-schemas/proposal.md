## Why

The SDK assembly declares the inputs of `render_widget`, `execute_action` and `preview_widget` as zod objects that hand-mirror the JSON Schemas in `definitions.ts`. Only the field descriptions are derived, so every new field or constraint has to be written twice. The `./host` bundle, and with it `Widgentic.Mcp`, already serves the definitions' own schemas, so the Node wire and the .NET wire are two renderings of one contract.

The zod schemas also validate arguments before our handlers see them. So on Node, a malformed call gets the SDK's generic message, while on .NET it gets the handler's structured error. The staging retest of `mcp-sdk-v2` showed the cost: Copilot passed `kind` (the payload's field) instead of `widget`, and got `widget: Invalid input: expected string, received undefined` rather than an error naming the mix-up. This picks up BACKLOG AGT-4.

## What Changes

- Every tool is registered with its exported definition's `inputSchema`, exactly as exported. All nine tools are covered, including the six that take no input. The wire schemas equal the `./host` bundle's.
- The assembly no longer validates arguments: a pass-through Standard Schema hands every call's arguments to the handler. The handlers already validate every argument with structured codes in the tool's own vocabulary, the checks every `./host` embedding runs. So malformed arguments now get the same answer on every host.
- A call that omits `widget` but carries a string `kind` gets the `MISSING_FIELD` error on `widget` with a message naming the mix-up. This applies to `render_widget` and `preview_widget`, so it reaches `.NET` with the next pin.
- `execute_action` refuses mistyped optional arguments that it used to ignore: a non-object `args`, a non-string `at` or `item`. Without zod in front, these checks belong to the handler.
- `zod` leaves the assembly and `@widgentic/mcp`'s optional peers. ext-apps 2 still requires it, and npm installs it as ext-apps' peer.
- Wire differences clients may notice: the three formerly zod-backed schemas lose the `$schema` stamp and gain the definitions' own details, such as `additionalProperties: false`, `required`, and `data`'s type list. The six tools without input now advertise their exported empty-object schema.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`:
  - **Server assembly is a library export:** the wire schemas are the exported definitions, and the assembly does no argument validation of its own.
  - **Rendering error contract:** the `kind`/`widget` mix-up is named, and the handlers' errors reach clients unchanged.
  - **Action execution tool:** mistyped `args`, `at` and `item` are refused.
- `package-distribution`:
  - **Dependencies are declared honestly:** no `zod` peer.

## Impact

- **Code:** `packages/mcp/src/server/server.ts`, `handlers.ts` (the mix-up message), `actions.ts` (the stricter optional arguments), their tests, the conformance corpus (new cases) and `tools/boundaries.test.ts` (the peer assertion).
- **Release:** a minor `@widgentic/mcp` (0.11.0), because of visible wire and error-text changes. `Widgentic.Mcp` follows with its 0.11 pin, as with 0.10, and picks up the handler messages through the bundle.
- **BACKLOG:** AGT-4 is removed when this change archives.

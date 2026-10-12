## Context

`server.ts` registers three tools with zod objects that mirror `definitions.ts`, and six without any input schema. SDK 2.x accepts any Standard Schema that also carries `~standard.jsonSchema`. It advertises that JSON Schema in `tools/list`, and validates arguments with `~standard.validate` before calling the handler. `fromJsonSchema(schema, validator)` builds such an object from a plain JSON Schema: `jsonSchema.input()` returns the schema as given, and validation goes through the `jsonSchemaValidator` passed in, with Ajv as the default.

The handlers (`handleRenderWidget`, `handlePreviewWidget`, `handleExecuteAction`, and the list handlers, which ignore input) are total. They validate every argument they use and answer in structured codes, and the `./host` bundle relies on exactly that: an embedding host passes the client's arguments straight to `call`.

## Goals / Non-Goals

**Goals:** one schema per tool on the wire, taken from `definitions.ts`; one validation path on every host; an error for the `kind` mix-up that names it.

**Non-Goals:**
- Output schemas.
- Changing what the handlers accept beyond the `execute_action` tightening.
- Teaching the handlers JSON Schema: they keep validating by code.

## Decisions

### D1. A pass-through Standard Schema, built in-house

`server.ts` wraps each definition's `inputSchema` in a five-line object:

```ts
const fromDefinition = (tool: McpToolDefinition): StandardSchemaWithJSON => ({
  "~standard": {
    version: 1,
    vendor: "widgentic",
    jsonSchema: { input: () => tool.inputSchema, output: () => tool.inputSchema },
    validate: (value) => ({ value })
  }
});
```

- **Why not `fromJsonSchema`:**
  - With its default validator, Ajv would reject malformed calls with its own messages before the handler runs. That's the problem this change removes.
  - With a permissive validator passed in, the result is the same object as above. But it needs a `jsonSchemaValidator` whose generic `getValidator<T>` forces an `as T` cast.
  - Our own object is typed `StandardSchemaWithJSON` (input and output `unknown`), and the handlers already take `unknown`.
- **Why not keep zod and drop its validation:** zod objects can't skip validation, and the mirror is the duplication this change removes.

### D2. Every tool takes its definition, including the input-less ones

- The six list tools are registered with their exported empty-object `inputSchema`, so `tools/list` is the definitions with nothing added and nothing missing.
- Their callbacks keep ignoring arguments.
- A test compares the whole listing with the exported definitions, so a future registration that drifts fails.

### D3. The mix-up is named where both hosts see it

- `handleRenderWidget` and `handlePreviewWidget` already answer a missing `widget` with `MISSING_FIELD` on `widget`. When the input carries a string `kind`, the message names the confusion and the value to use: "'widget' is required: 'kind' is the payload's field; pass the kind id as 'widget' (widget: \"card\")".
- The path and code stay the same, so clients that branch on codes are unaffected.
- Because it lives in the handler, the `./host` bundle carries it to every embedding host.
- **Not adopted:** accepting `kind` as an alias. The contract keeps one name per input, and an alias would make the advertised schema lie.

### D4. `execute_action` refuses what zod used to refuse

zod rejected a non-object `args` and non-string `at`/`item`, and the handler silently ignored them. With the handler as the only gate, it now answers `INVALID_TYPE` on that path, before any scope check or fetch. Valid calls are unaffected; the frame's bridge always sends these as an object and strings.

### D5. zod leaves the peers

`server.ts` imports no zod, so `@widgentic/mcp` no longer declares it. ext-apps 2 declares `zod ^4.2.0` as a required peer, so a host installing ext-apps still gets zod. The root and docker manifests keep their exact pins for that reason. The boundary check's SDK pattern still lists `zod`, so a future import is confined to `server.ts`.

## Risks / Trade-offs

- **Clients see a stricter schema.** `additionalProperties: false` is now advertised on the three app-facing tools, where the zod rendering may have been more permissive. Hosts read schemas for prompting and form-building, and the handlers still ignore unknown keys. `.NET` has advertised these exact schemas since 0.9.
- **Error texts change** for malformed calls on Node, from the SDK's message to the handler's structured JSON error. That's the point of the change, and it matches `.NET`.

## Migration Plan

- One release: minor `@widgentic/mcp` 0.11.0, staged on the demo first, per the staging strategy.
- After the npm publish, `Widgentic.Mcp` 0.11.0 bumps its pin.
- The apps repo bumps its range and deploys.

## Open Questions

None.

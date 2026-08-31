## MODIFIED Requirements

### Requirement: The action test call is a production-path call
Testing an action SHALL execute it server-side through the same guarded fetch, secret resolution and output validation as execution in the MCP surface, with values redacted from the result, and SHALL draw on the same per-principal execution budget — an exhausted budget answering `RATE_LIMITED` rather than failing. It SHALL live on its own route so that an action may itself be named `test`, and it SHALL never be performed by the browser.

Output validation for a STANDALONE action means the action's own contract: the response SHALL be validated against the action's output schema. The fold a widget applies to a response — the binding-level `mode` and `map`, authored per widget, later — SHALL NOT be applied by the test, because no binding exists at action-authoring time; in particular the `merge` default's object-shape requirement SHALL NOT fail a test whose response satisfies the schema. Binding-time folding keeps its own validation where the binding is authored.

#### Scenario: The test call spends the shared budget
- **WHEN** test calls exceed the principal's execution budget
- **THEN** the surface SHALL answer `RATE_LIMITED` and SHALL make no outbound request

#### Scenario: The test route shadows no action
- **WHEN** an action is named `test`
- **THEN** it SHALL remain addressable, and the test route SHALL be unaffected

#### Scenario: A non-object response tests on its schema, not a widget's fold
- **WHEN** an http action whose output schema describes an array or scalar response is tested and the API answers accordingly
- **THEN** the test SHALL pass with the redacted response, and no `merge`-shape requirement SHALL be applied

#### Scenario: A response violating the schema still fails
- **WHEN** the API's response does not satisfy the action's output schema
- **THEN** the test SHALL fail with `INVALID_ACTION_OUTPUT` naming the violation

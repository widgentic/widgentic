## ADDED Requirements

### Requirement: Tools carry the bundle's annotations
Each widgentic tool the package registers SHALL carry, as its `annotations`, the `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` the bundle's `definitions()` gives it. The values SHALL come from the bundle, never restated in C#. A host's own tools keep whatever annotations the host declares.

#### Scenario: Listed tools carry the bundle's annotations
- **WHEN** a C# SDK client lists the tools of a server built with `WithWidgentic`
- **THEN** every widgentic tool's annotations SHALL equal the bundle's definition for that tool, and `list_widgets` SHALL be read-only, non-destructive, idempotent and closed-world

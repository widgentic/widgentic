# mcp-widget-output — package-split-readiness delta

## MODIFIED Requirements

### Requirement: MCP module programmatic surface
The `@widgentic/mcp` package SHALL export the widgentic MCP convention from its root entry: `toWidgetResult`, `toTextResult`, `extractWidgetPayload`, `isWidgetResult`, `hostSupportsWidgets`, `declareWidgetCapability`, and the constants `WIDGENTIC_MIME_TYPE` (`"application/vnd.widgentic+json"`), `WIDGENTIC_URI` (`"ui://widgentic/widget"`), `WIDGENTIC_CAPABILITY` (`"widgentic"`), and `WIDGENTIC_VERSION` (`1`). MCP shapes SHALL be structural local types; the convention SHALL NOT depend on an MCP SDK, so a host on any MCP framework can emit and read widgentic results.

#### Scenario: Constants are exported for interop
- **WHEN** `WIDGENTIC_MIME_TYPE` is imported from `@widgentic/mcp`
- **THEN** it SHALL equal `"application/vnd.widgentic+json"`

#### Scenario: The convention needs no SDK
- **WHEN** a host imports `toWidgetResult` and `extractWidgetPayload` from `@widgentic/mcp` with no MCP SDK package installed
- **THEN** the import SHALL succeed and both functions SHALL work on plain result objects

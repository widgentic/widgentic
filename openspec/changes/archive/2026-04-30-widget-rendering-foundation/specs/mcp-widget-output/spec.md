## ADDED Requirements

### Requirement: MCP tool widget return convention
An MCP tool SHALL be able to return a widget payload as a structured tool result so any widgentic-aware host can render it without bespoke parsing.

#### Scenario: Tool returns a widget payload
- **WHEN** an MCP tool returns a result tagged as a widgentic payload conforming to the widget contract
- **THEN** a widgentic-aware host SHALL render it using the widget catalog

#### Scenario: Non-widget result is unaffected
- **WHEN** an MCP tool returns a plain text or non-widget result
- **THEN** the host SHALL NOT attempt to render it as a widget

### Requirement: Host capability negotiation
Hosts SHALL advertise widgentic support so tools can decide whether to emit widget payloads or fall back to text.

#### Scenario: Capable host
- **WHEN** the host advertises widgentic support during MCP initialization
- **THEN** tools MAY emit widget payloads

#### Scenario: Incapable host fallback
- **WHEN** the host does not advertise widgentic support
- **THEN** tools SHALL emit a plain text representation instead of a widget payload

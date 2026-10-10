## MODIFIED Requirements

### Requirement: Host capability negotiation
Hosts SHALL advertise widgentic support in their client capabilities, so tools can decide whether to emit widget payloads or fall back to text. A 2025-era host advertises them once, during MCP initialization. A host on protocol revision 2026-07-28 never initializes and carries them in every request's `_meta["io.modelcontextprotocol/clientCapabilities"]`. Either way, the tool reads support from the capabilities object it has, and the helper takes that object as given.

#### Scenario: Capable host
- **WHEN** the host advertises widgentic support in its client capabilities, during MCP initialization or in a 2026-07-28 request's `_meta`
- **THEN** tools MAY emit widget payloads

#### Scenario: Incapable host fallback
- **WHEN** the host does not advertise widgentic support
- **THEN** tools SHALL emit a plain text representation instead of a widget payload

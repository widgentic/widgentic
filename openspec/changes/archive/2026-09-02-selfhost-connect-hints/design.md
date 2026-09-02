# Design

The server knows the topology, the page knows its origin: the server emits a hint
(`explicit URL | "/mcp" | nothing`) as a meta tag and the page resolves it against
`location.origin`, falling back to the compose default port when nothing was said. No
new route, no fetch; the hint is a pure function with its own test.

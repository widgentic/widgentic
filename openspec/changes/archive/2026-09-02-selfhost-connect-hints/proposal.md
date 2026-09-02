## Why

Two findings from using the deployed self-host demo: the Keys section never says WHERE a
host connects (the person has to know the deployment's topology), and the `execute`
checkbox inherits the text-input chrome and sits misaligned in its row — the same defect
widgentic.dev fixed in v71.

## What Changes

- The web service tells the page its MCP endpoint (`WIDGENTIC_MCP_PUBLIC_URL`, else this
  origin's `/mcp` when it forwards, else nothing — the page falls back to the compose
  default `http://<host>:8081/mcp`); the Keys section shows it with both key forms, and the
  one-time reveal adds the ready-to-paste `?key=` URL.
- The checkbox is a checkbox again (15 px, no input padding, accent-coloured), its label
  an inline flex row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `self-host-example`: "The app mounts the authoring surface and the designers" gains the
  connect hint and its scenario.

## Impact

`examples/docker/edge.ts` (+ tests), `web.ts`, `main.ts`, `index.html`, `compose.yml`, `README.md`.

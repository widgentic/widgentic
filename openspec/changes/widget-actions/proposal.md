# Widget actions: prompt and http actions, with secrets

## Why

Every widget widgentic renders is a dead end: the only affordance is a link the host opens. The groundwork for interactivity has been laid deliberately over the last cycles (native tree mounting, streaming previews, per-principal stores, hardening), and the 2026-08-25 three-host probe (basic-host, claude.ai, VS Code Copilot Chat — recorded in TESTING.md) settled the protocol questions that were blocking the design: app-initiated `tools/call` is proxied by every host, `ui/message` means "prefill the composer" on both production hosts, app-only tools are hidden from the model everywhere, and the capability flags are only partly reliable. With host behavior measured rather than assumed, the converged design can now become a change.

## What Changes

- **Action model** (new `widget-actions` capability): two action kinds. `prompt` proposes a user message through `ui/message` (bound text, plain, length-capped). `http` performs a server-side GET/POST against an author-declared URL with two JSON-Schema contracts — input (builds query or body) and output (validates the response). Actions are shared per principal or defined inline; they bind to buttons and links through an `action` attribute (mutually exclusive with `href`) and to the widget through a once-per-instance `load` (http GET only).
- **Template DSL**: `action`/`load` bindings; input mappings are records of bind paths or constants resolved **at render time in node scope** (no client-side evaluation); scope helpers `$root`, `$parent` (repeatable) and `$index` in the shared path resolver; new validation codes; `action` bindings compile to a `data-wg-action` descriptor on the element carrying the binding's stable id and its resolved arguments.
- **Execution**: a seventh tool, `execute_action`, registered with `_meta.ui.visibility: ["app"]`. The server resolves the binding from the principal's stored template or shared action — it never accepts a client-supplied URL or definition — validates the arguments against the input schema, performs an SSRF-guarded fetch, validates the response against the output schema, applies the output mapper (`replace | merge | patch`, default `merge`) to the round-tripped payload, re-renders, and returns fresh `structuredContent`. Per-principal rate limiting at the HTTP edge; every resolved secret value is scrubbed from diagnostics and logs.
- **Bridge (app template)**: delegated dispatch for `[data-wg-action]`; http actions gated on `hostCapabilities.serverTools`, prompt actions always enabled with a JSON-RPC `-32601` (the consistent unsupported-method signal) surfacing as an inline alert; elements disabled and a pulsing overlay while in flight; the previous render kept on failure; actions inert until the first complete `tool-result`; `load` fires once, GET only; after every successful http action and load, `ui/update-model-context` carrying both a text block and `structuredContent` (the modality flags disagree across hosts and all accepted both).
- **Secrets** (new `widget-secrets` capability, option B): envelope encryption — a random AES-256-GCM data key per secret, wrapped by a Key Vault key (KEK) that never leaves the vault; ciphertext stored in the principal's Cosmos partition; write-only designer UI (set / replace / delete, never shown); referenced from http actions by name as `{ "secret": "<name>" }` in headers and query parameters only; resolved server-side at execute time; a new `execute` key scope required for http actions.
- **Store**: `actions` and `secrets` entities beside widgets/themes/schemas; shared actions and secrets cannot be deleted while referenced; `execute` scope on keys (existing keys keep `read` only until the user opts in).
- **Designer and app**: an Actions section (create prompt/http actions; an http action can be saved only after a test call through the production execute path succeeds and its response validates against the output schema; saving a prompt action shows a "this content is your responsibility" warning); a Secrets section (write-only); a key-scope toggle; and in the widget designer, binding an element to an action (shared or inline, input map, output mode).
- **Infra**: a Key Vault key for the KEK and `Key Vault Crypto Service Encryption User` on both managed identities (web wraps, MCP unwraps); `WIDGENTIC_KEK_ID`; a local development cipher so file-store rigs need no vault.

Out of scope (recorded so they are not rediscovered): form inputs and client-side argument collection, shared mapper entities, cross-server tool calls, app-side `tools/list` (proxied by no host), widget-to-widget messaging, refresh timers.

## Capabilities

### New Capabilities

- `widget-actions`: the action model — definitions (`prompt`, `http`), input/output contracts, input mapping and output modes, `load` semantics, the trust boundary for execution, and what the model is told afterwards.
- `widget-secrets`: per-principal secrets — envelope encryption with a vault-held KEK, references from actions, write-only lifecycle, redaction, and the roles the identities need.

### Modified Capabilities

- `template-widgets`: path resolution gains `$root`/`$parent`/`$index`; templates gain `action` and `load` bindings with their validation and untrusted-author rules; compiled output carries action descriptors.
- `mcp-server`: the `execute_action` tool (app-only visibility, principal- and scope-gated, rate-limited); the app template's action layer (dispatch, gating, in-flight and failure states, `load`, model-context updates); execute-scope enforcement.
- `widget-store`: `actions` and `secrets` entities on the port and adapters; referential integrity on delete; the `execute` key scope.
- `widgentic-app`: Actions and Secrets sections; key scope selection; the test-call and prompt-warning save rules.
- `widget-designer`: action binding in the widget designer; a standalone action designer in the same embeddable family.
- `reactive-rendering`: native mounts expose action activations to the host through an `onAction` option and stay inert without it.
- `widget-catalog`: group composition stamps each item's action descriptors with the item's location (`at`) so bound widgets stay executable inside groups.

## Impact

- Library: `src/templates/` (types, validate, guards, compile — scope chain, action bindings), new `src/actions/` (zero-dep model: definitions, validation, mapping, request building, response validation, output modes), new `src/secrets/` (cipher port, local cipher, Key Vault cipher over the optional peer `@azure/keyvault-keys`, redaction), `src/store/` (types, memory, file, cosmos, compose), `src/mcp-server/` (definitions, handlers, server assembly, app template, a shared SSRF-guarded fetch extracted from the image inliner), `src/reactive/mount.ts`, `src/designer/`.
- Apps: `apps/mcp-server/http.ts` (rate limit, KEK/cipher wiring), `apps/web/` (Actions, Secrets, key scopes).
- Infra and ops: `infra/main.bicep` (KEK key resource, two role assignments, env), `TESTING.md` (runbook, host matrix), README.
- Protocol surface: one new tool visible to apps only — non-Apps clients still list it (the SDK does not filter); its description says so.
- Dependencies: `@azure/keyvault-keys` as an optional peer; the library keeps zero runtime dependencies.
- Deploy: the first release after merge needs the one-time KEK creation and the Bicep role assignments before any secret can be saved.

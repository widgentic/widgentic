## Context

See proposal.md — Why. The relevant current state: widgets are pure data (`WidgetNode` trees; `on*` attributes rejected by the template validator and re-filtered by the app template's mounter); the only JavaScript in a rendered widget is the fixed inline bridge in `ui://widgentic/app.html`, which already speaks the Apps protocol (`ui/initialize`, `size-changed`, tool-result routing, `ui/open-link`); the HTTP server is stateless per POST and composes a per-principal catalog at the transport edge; the Cosmos adapter is identity-only with the MCP identity read-only and the web identity writable; `widgentickv` holds the deployment secrets via ARM references and is not a runtime dependency today.

Constraints measured by the 2026-08-25 probe (TESTING.md, verification log): app-initiated `tools/call` is proxied by basic-host, claude.ai and VS Code Copilot Chat and is the only same-instance round trip; `ui/message` is "prefill the composer" on both production hosts; `message` is advertised by one host of three while all support it; `updateModelContext` modality sets disagree across hosts while all accept text and structured; app-side `tools/list` is proxied by none; app-only tools are hidden from the model everywhere but listed by the SDK server; a `position: fixed` panel is invisible to the size-changed measurement.

Protocol constraints from the spec: cross-server `tools/call` is blocked, so widgentic can execute only its own tools; the frame's CSP is deployment-level and shared by every principal's widgets, so the iframe can never reach the network itself; the bridge cannot render templates (it only mounts trees), so every re-render is a server round trip.

## Goals / Non-Goals

**Goals:**
- Interactivity as declared data interpreted by trusted code: authors write bindings, the compiler resolves them, the bridge dispatches them — no author code ever runs.
- One execution path (`execute_action`) shared by production clicks, `load`, and the designer's test call, so what is verified at design time is what runs.
- Every host observed in the probe works without per-host branches in the bridge: gate on `serverTools`, treat `-32601` as the unsupported signal, send both context modalities.
- The library stays zero-runtime-dependency; the Key Vault cipher is an optional peer behind its own entry, like the Cosmos adapter.

**Non-Goals:**
- Client-side argument collection (form inputs); all arguments are fixed at render time.
- A shared mapper entity; mapping lives on the binding.
- Discovering app tools from the frame (`tools/list` is proxied nowhere).
- Following redirects, non-JSON responses, streaming responses, or refresh timers.
- Hiding `execute_action` from non-Apps clients (the SDK cannot; the description says what it is).

## Decisions

**D1 — Execution is server-side through an app-only tool, never a fetch from the iframe.** The frame's CSP is one per deployment and shared across principals; declaring a user's API domain would open it for everyone, and credentials would enter the sandbox and potentially `structuredContent`. Server-side execution reuses the SSRF-guarded, DNS-pinned fetch discipline from the image inliner (extracted into a shared guard), per-principal composition, and the existing `patch()` mounter. Alternative rejected: iframe `fetch` with per-widget `connectDomains` — impossible with a shared template, and unsafe.

**D2 — The request names a binding, never a definition.** `execute_action` takes `{ widget, action: <binding id>, args, payload }` and resolves the definition from the principal's composed catalog. Binding ids are the dotted template path of the element (or `"load"`), which is deterministic and needs no stored id. A client can tamper with `args` (bounded by input-schema validation — the same trust level as a user typing values) but can never choose a URL, method, header or schema. Alternative rejected: shipping inline definitions in the descriptor and executing what the client sends — an SSRF-by-design.

**D3 — Input mappings resolve at render time in node scope.** The compiler already evaluates bindings in scope; resolving the input record there and embedding the resolved arguments in the element's `data-wg-action` descriptor dissolves the "mapper source schema varies per node" problem and keeps the bridge free of any path evaluator. It requires the scope chain (`$root`, repeatable `$parent`, `$index`) in the shared resolver — a small refactor of `interpretNode` from a single scope value to a frame stack, which benefits `bind`/`each`/`when` everywhere. Alternative rejected: an actions table in `structuredContent` with per-node indices — more plumbing through the catalog interface for no security or size gain at v1 sizes (descriptors are small; templates are bounded).

**D4 — Descriptors are inline data attributes; `WidgetNode` stays pure.** `data-wg-action` is a string attribute like any other, so the render tree type, `renderToHtml`, the DOM builder and the `tree ↔ html` invariant are untouched. The `data-wg-` prefix becomes reserved in the validator (hand-written descriptors fail with `FORBIDDEN_ATTRIBUTE`), and the mounter treats the attribute as inert data. `load` is not a node concern, so it rides `structuredContent.load` — the only structuredContent addition — resolved by the render handler against the rendered payload.

**D5 — Bindings attach at composition.** `composeCatalog` knows the stored widget (template + `load`) and the principal's shared actions; it registers the compiled renderer with an attached binding table (`catalog.actions(kind)`) so `handleRenderWidget` can emit `load` and `handleExecuteAction` can resolve ids without re-reading the store. Dangling `ref`s become composition diagnostics and `disabled: "unresolved"` descriptors — a render never fails because an action vanished.

**D6 — The payload round-trips.** The server is stateless per POST and the bridge cannot render, so the frame sends its held payload with every execution; the server applies the output mode, re-validates as a payload of that kind (data schema included), renders, inlines images, and returns the same `structuredContent` shape. Size is bounded by the existing `maxEntryBytes`-scale limits on the request. Alternative rejected: server-side session state — contradicts the stateless deployment and scale-to-zero.

**D7 — Output modes are explicit with `merge` as default.** `replace` for full refreshes, `merge` (shallow, top-level) as the non-destructive default, `patch` at a path for partial fetches; an optional `map` projects the response first. Re-validation after merge is what turns a schema-breaking response into `INVALID_ACTION_OUTPUT` instead of a broken render.

**D8 — Gating rules come from the probe, not the spec's flags.** `http` descriptors are enabled iff `hostCapabilities.serverTools` is present (advertised by every host that proxies). `prompt` descriptors are always enabled; a JSON-RPC error (`-32601` on every host tested) surfaces as an inline alert. `ui/update-model-context` always carries both `content:[{type:"text"}]` and `structuredContent`. Server-side scope knowledge is pushed into the render (`disabled: "scope"`, no `load`) so a read-only key sees unavailable affordances instead of failing clicks. Alternative rejected: gating prompts on the `message` flag — would disable working prompts on two of three hosts.

**D9 — `execute` is a key scope, fixed at creation.** A leaked key today reads a catalog; with actions it could exercise stored secrets against third-party APIs. Requiring an explicit `execute` scope (default off, chosen when the key is created, never edited) keeps existing keys harmless and makes the grant a deliberate act. The anonymous principal never has it. Alternative rejected: scope only for actions referencing secrets — two rules to explain, and unauthenticated execution of arbitrary stored GETs is still an abuse surface.

**D10 — Secrets use envelope encryption with a vault-held KEK (option B).** Per-secret random AES-256-GCM data keys wrapped by a Key Vault *key* through `wrapKey`/`unwrapKey`; ciphertext lives in the principal's Cosmos partition as `secret:<name>`. Both identities get `Key Vault Crypto Service Encryption User` (wrap/unwrap only; no secret read; the MCP identity stays Cosmos read-only). Rotation re-wraps data keys without touching values. A `SecretCipher` port with a `KeyVaultCipher` (optional peer `@azure/keyvault-keys`, RSA-OAEP-256) and a `LocalCipher` (`WIDGENTIC_LOCAL_KEK`, dev only) keeps file-store rigs vault-free. Alternative rejected: one Key Vault secret per user secret — high-cardinality misuse of the vault, per-action vault latency, weaker per-principal lifecycle, and isolation still only in app logic.

**D11 — Secret references are allowed in headers and query only.** URLs, bodies and input mappings would need escaping and logging rules that are easy to get wrong; headers and query cover bearer tokens and API-key parameters, which is the actual demand. Redaction scrubs every resolved value from every emitted string, including remote echo.

**D12 — Rate limiting is a process-level token bucket at the HTTP edge.** The stateless server is one process per replica; a per-principal bucket (default 60/min) in `apps/mcp-server/http.ts` is ~20 lines and covers the realistic abuse (a hostile client calling `execute_action` in a loop). Disable-while-in-flight in the bridge is UX, not a control. Multi-replica exactness is not required — the bucket bounds per replica, which is good enough at `maxReplicas: 2`.

**D13 — The designer never touches the network.** The action designer takes `options.testCall`; the web app supplies a callback that posts to a session-authorized API route which runs the production execute path (SSRF guard, secret injection, response validation) and returns a redacted result. Same code, same guarantees, no browser-side fetch, no CORS.

**D14 — Fetch policy: https only, no redirects, JSON only, 8 s, 256 KiB.** Redirects are refused rather than followed because POST bodies and secret headers must not travel to an unvalidated host; each connection is DNS-pinned to the validated address. Non-JSON responses fail fast (`INVALID_ACTION_OUTPUT`) — the output schema is the only contract the widget has.

## Risks / Trade-offs

- [`execute_action` is visible to non-Apps clients and a model may call it] → its description says it is for widgets; without a frame there is no `payload` in the model's hands that the server would accept unvalidated, and the scope/rate limits apply regardless. Documented, not prevented.
- [Render-time argument resolution is stale if the widget's data changes client-side] → no client-side state exists at v1; when form inputs arrive, arguments must be collected at activation (recorded as the v2 change in this design's Non-Goals).
- [Two hosts support `ui/message` without advertising it; a future host may not support it at all] → the `-32601` path produces a visible alert rather than a silent failure; the badge/tooltip copy explains it.
- [Load fires a network call on every fresh widget instance] → once per instance, GET only, rate-limited, scope-gated, and omitted for read-only keys; hosts that re-mount per render (claude.ai) will call it per render — acceptable and visible in the model context.
- [Key Vault becomes a runtime dependency of both apps] → only for secret writes and executions that reference secrets; renders and prompt actions never touch the vault. Vault outage degrades to `ACTION_FETCH_FAILED`-class errors with the old render kept.
- [The scope-chain refactor touches the hottest path in the template interpreter] → the existing matrix of compile tests plus new `$root`/`$parent`/`$index` cases; behavior for existing paths is unchanged by construction (frame stack top = old scope).
- [Descriptor JSON inflates tables with many bound rows] → arguments are the resolved fields only; templates are node-budgeted; if it matters later, a per-render table (D3's rejected alternative) is a compatible optimization.
- [The `data-wg-` reservation could reject an existing stored template] → no stored template uses the prefix today (nothing rendered it); composition reports any such template as a diagnostic instead of dropping it.

## Migration Plan

1. Library and server ship first (phases 1–6 in tasks.md); `execute_action` exists but no stored widget binds anything, so production behavior is unchanged.
2. Infra: create the KEK (`az keyvault key create`), add the two role assignments and `WIDGENTIC_KEK_ID` through `main.bicep`; deploy. Secrets cannot be saved before this step — the app shows the section disabled with a reason when no cipher is configured.
3. Web app sections and designer bindings ship last; existing keys keep `read` and see disabled http affordances until the person creates an `execute` key.
4. Rollback: redeploy the previous image; stored actions/secrets/bindings are ignored by the previous server (unknown fields are skipped on read per the store's forward-compatibility rule), and `data-wg-` attributes never reach a template that the previous validator would see.

## Open Questions

- Whether `structuredContent` context updates actually reach the model on each host (accepted everywhere, unverified) — answerable by asking the model in a later turn; it changes nothing here because both forms are always sent.
- Default rate-limit value (60/min) and fetch caps — tunable by environment without spec change.

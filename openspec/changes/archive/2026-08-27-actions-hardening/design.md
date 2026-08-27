## Context

See proposal.md — Why. The code under repair shipped in v49–v55 and is covered by 830 tests; every finding here was reproduced or read-verified during the 2026-08-26 review (report in the session scratchpad, mirrored in TESTING.md's verification log once this change lands). Constraints that shape the fixes: the library stays zero-runtime-dependency (`net.BlockList` and `node:crypto` are Node built-ins, fine); templates and action definitions are untrusted author input while `args`/`payload`/`at` are untrusted client input; the bridge is a hand-rolled JS string with no build step, so every state fix must stay small and testable through the existing harness; stored data already exists in production (widgets, actions, secrets) so validation tightening must be checked against it before deploy.

## Goals / Non-Goals

**Goals:**
- Close every Critical/High/Medium finding with a regression test, and land the Low sweep (dead code, duplicated helpers, casts, comments) without behavior change.
- Keep the fixes at the layer that owns the invariant: tag policy in `templates/guards`, argument policy in `actions/execute`, address policy in `guarded-fetch`, state-machine fixes in the bridge — no cross-layer patches.

**Non-Goals:**
- Allowlisting HTML tags (a denylist of active-content tags is enough for the threat: code execution in the frame; an allowlist would break existing templates for no security gain today).
- Nested groups (the catalog forbids them; the outward-prefix branch is removed rather than completed).
- A client-side test harness for `apps/web/main.ts` beyond the two behaviors the review pinned (busy control, banner resolution) — noted as a follow-up.
- Changing the `ui/message` trust model (host-dependent; documented, not engineered around).

## Decisions

**D1 — Tag policy is a denylist enforced at both layers.** `FORBIDDEN_TAGS` (script, iframe, frame, frameset, object, embed, style, link, meta, base, template, noscript) fails validation with `FORBIDDEN_TAG` and is skipped by the interpreter, mirroring how `on*` attributes are handled; `srcdoc` joins `FORBIDDEN_ATTR`, and `data`/`poster`/`ping` join `URL_ATTRS`. Mounters are not changed — the tree never carries these tags. Rollout: compose every principal's stored widgets against the new validator before deploy; any hit is a real incident, not a compatibility issue.

**D2 — Declared-args-only, author-wins ordering.** `validateArgs` rejects keys absent from `input.properties` (a schema without `properties` accepts no arguments) and keys colliding with fixed `query`; `buildRequest` writes arguments first and fixed `query`/`headers` last. Two guards because they defend different things: the first keeps the wire contract explicit, the second makes the author's values unforgeable even if a future schema feature relaxes the first. Alternative rejected: honoring `additionalProperties` in the schema validator — it would silently change `dataSchema` semantics for every widget.

**D3 — Address policy via `net.BlockList`.** Replace the hand-written IPv4/IPv6 checks with a `BlockList` seeded with the RFC 1918/6890 ranges plus `::ffff:0:0/96`, `::/96` (compat), `64:ff9b::/96`, `2002::/16`, `fc00::/7`, `fe80::/10`, `ff00::/8`, loopback and multicast; for mapped/compat/NAT64/6to4 forms also check the embedded IPv4. `BlockList.check` parses uncompressed and mixed forms, which is what the hand parser got wrong. Keep the pinned-connect design; add the low-value IPv4 ranges the review listed.

**D4 — One deadline, honored by the transport.** `pinnedHttpsFetch` observes `init.signal`: on abort it destroys the request; `guardedJsonFetch` creates the 8 s `AbortSignal.timeout` once and threads it through header, body-read and JSON parse. The socket idle `timeout` stays as a second line. Content type is checked from headers before the body is read; `204`/empty body → `null`; media types matching `/^application\/([\w.+-]+\+)?json$/` are accepted.

**D5 — Bridge state machine: cycle counter, request timeout, load-after-init.** A `cycle` integer increments on `tool-input`/`tool-cancelled`; every `httpAction` captures it and ignores its result if it changed. `request()` gains an optional timeout used only by action calls (30 s) so protocol calls keep their current semantics. `maybeLoad` records the pending load descriptors and fires them when `serverToolsAvailable()` first becomes true (from either the tool-result path or the initialize `.then`), and one `updateModelContext` runs after the whole chain. `decorateActions` stashes an author `title` in `data-wg-title` and restores it. The action click handler stops propagation so the link interceptor never sees an activation.

**D6 — Keyboard parity for action anchors.** Since validation forbids `href` on bound anchors, they have no native focus/activation; both the bridge and `mountWidget` add `tabindex="0"` and `role="button"` to non-button hosts at decorate/mount time, and the keydown handlers exclude only `BUTTON`. Alternative rejected: forbidding actions on `a` — the designer offers them deliberately (links that act).

**D7 — Output-path grammar reuses the template grammar's spirit, not its resolver.** A small `isDataPath(value)` in `actions/validate` (non-empty segments, no `$`-tokens, no `__proto__|constructor|prototype`) validates `path` and `map` keys/values; `setPath`/`getPath` use `Object.hasOwn` reads and index-only writes into arrays. `"."` is the whole projection and is only valid alone — the order-dependent mixed form is a validation error rather than a defined merge.

**D8 — Error hygiene: fixed messages out, details in the log.** `handleExecuteAction`/`testHttpAction` map thrown store/vault errors to `"Secret store unavailable."` and `console.error` the detail; `secretValue` in all three stores wraps `SecretError`/transport errors into `StoreRejectionError` so the API's `instanceof` branch handles them. `(error as Error).message` is replaced by an `errorMessage(unknown)` helper everywhere touched.

**D9 — KEK version comes from configuration.** `createKeyVaultCipher` derives `version` from `options.keyId` whenever present (client injected or not); `kekVersionOf` matches `/keys/<name>/<version>` explicitly and returns `""` for versionless ids, in which case `wrap` records the version from the vault's `keyID`; `unwrap` refuses versions it does not hold.

**D10 — Designer editors: read live state, commit named rows only.** `createBindingEditor`/`createDefinitionEditor` handlers read `current` at event time (no captured snapshots), and `render()` is split into `renderHead`/`renderInput`/`renderOutput` so a commit re-renders only its section (focus survives). New header/query/projection rows live in editor-local state until they have a name; only then does `onChange` fire. Helper completions become complete paths. The template panel builds a binding editor only when the element has a binding.

**D11 — Web API: `POST /api/action-test`, limiter shared, writes gated.** The test call leaves the `actions/<name>` namespace; it takes the same `createExecutionLimiter` instance as the MCP edge (constructed in `apps/web/http.ts`, default 60/min); malformed definitions return the structured `testHttpAction` result. Secret PUT/DELETE check `secretsEnabled` exactly like GET. `withBusy(pending, work, control)` takes the control from the click handler's `event.currentTarget`.

**D12 — Cleanup shapes.** `src/shared/plain-object.ts` (relative imports keep every entry zero-dep and the source-scan tests green); `src/store/refs.ts` for the reference scans (Cosmos stops importing the memory store); `compile.ts` imports `formatValue` from the catalog; `getAtPath`/`setAtPath` become the exported names of the real functions; `ActionContext` becomes `Pick<CompileOptions, …>` built once; `h<K extends keyof HTMLElementTagNameMap>` overload removes the DOM casts; `StoreRejectionError.code` becomes a union including `SecretErrorCode`; execute_action's zod schema derives descriptions from `EXECUTE_ACTION_TOOL` via the existing `doc()` pattern.

## Risks / Trade-offs

- [Declared-args-only breaks an existing action whose template maps an undeclared field] → the designer's binding validator already refuses undeclared input keys, so stored bindings comply; only hand-written descriptors could differ. Verify against production data during rollout (same pass as the tag check).
- [Minimum secret length rejects a legitimately short token] → 8 bytes is below any real API key; existing stored secrets are unaffected (the rule applies on write).
- [`net.BlockList` semantics differ subtly from the hand parser] → keep `isPrivateAddress` as the public function with the new implementation and extend `inline-images.test.ts` with the mapped/compat/NAT64/uncompressed cases so both callers are covered.
- [Bridge timeout races a slow but legitimate action] → 30 s is far above the 8 s server deadline; the alert is non-destructive and the next activation works.
- [Splitting the designer `render()` changes DOM structure that tests query] → the class hooks (`wgd-binding-mode`, `wgd-map-target`, …) are kept; tests assert on them, not on structure.
- [Cosmos scans over raw docs read entries `widgets()` would skip] → the scan only extracts references (never renders or trusts the entry), so the widened read carries no new risk.

## Migration Plan

1. Land library and server fixes with tests; run the full suite.
2. Before deploying, compose every principal's stored widgets and actions with the new validators (a one-off script over the Cosmos store) and report any `FORBIDDEN_TAG` / undeclared-arg hits — none expected; any hit is investigated as an incident before the deploy proceeds.
3. Deploy v56 (both apps); the designer test-call route moves in the same release as the client, so no window with a broken designer.
4. Rollback: redeploy v55; no data-shape changes are introduced.

## Open Questions

None that block implementation. Whether to move from a tag denylist to an allowlist can be revisited once the authoring guide stabilizes; it changes no spec here.

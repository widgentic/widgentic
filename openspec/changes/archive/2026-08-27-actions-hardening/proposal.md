# Actions hardening: close the review findings on widget actions

## Why

The deep review of the shipped widget-actions implementation (2026-08-26, four scoped reviewers, findings reproduced) found five critical defects, fifteen high-severity bugs, seventeen medium edge cases and a long tail of dead code, duplicated helpers, unsafe casts and stale comments. Three of the critical items are exploitable today: a template author can render a `<script>` (or `iframe srcdoc`/`object`) that runs inside the widget frame, which now holds the action bridge; a tampered frame can override an author's fixed, secret-bearing query parameter because undeclared `args` pass validation and are written after the fixed values; and the SSRF guard misses IPv4 addresses embedded in IPv6 literals. The rest degrade correctness silently (idle-only fetch timeout, `NaN` rate limit refusing everything, designer editors dropping edits, unreachable keyboard activation of action links). All of it is in code that shipped in v49–v55, so this change closes every finding in one pass rather than leaving a known-unsafe surface live.

## What Changes

- **Template safety**: a tag policy (`FORBIDDEN_TAG` for script, iframe, frame, frameset, object, embed, style, link, meta, base, template, noscript), `srcdoc` forbidden, `data`/`poster`/`ping` URL-guarded; `each` iterations always consume budget; prompt `{ bind }` segments face path-syntax validation.
- **Action contracts**: http arguments MUST be declared in the input schema and MUST NOT collide with fixed `query`; fixed headers/query are applied last so the author always wins; header/query names are validated (RFC 7230 tokens, no `host`/framing headers); output `path`/`map` follow the dotted-path grammar (no empty/reserved/prototype segments), `"."` is only valid alone, `map: {}` and `path` outside `patch` are refused; `merge` onto a non-object is an output failure.
- **Fetch policy**: IPv6-aware private-range detection (mapped/compat/NAT64/6to4/multicast, uncompressed forms); a total 8 s deadline covering body streaming; content type checked before reading; 204/empty bodies are `null`; `+json` media types accepted.
- **Server**: `execute_action` refuses empty `action` ids and `at` outside `data.items.<i>`; store/vault error text never reaches clients; `testHttpAction` validates the definition first; execute_action's wire schema derives from the JSON definition like `render_widget`; the edge caps request bodies (413); a non-finite `WIDGENTIC_EXECUTE_RATE` falls back to the default.
- **Bridge**: keyboard activation for action anchors (focusable, `role=button`); `load` never lost when the result precedes initialize; results from a reset cycle are dropped; pending action requests time out into the alert; alerts clear on new cycles; author `title`s are restored; an action inside an `<a href>` no longer also opens the link; one model-context update after a load chain; notes count bindings, not rows.
- **Secrets/KEK**: minimum secret length, `INVALID_SECRET_VALUE`, strict envelope decoding, guarded re-wrap, zeroing on failure; KEK version derived from `keyId` regardless of client injection, versionless ids handled, unknown versions fail clearly; redaction covers percent-encoded and JSON-escaped forms and object keys.
- **Store**: integrity scans over raw entries (invalid ones included); `putAction` cannot break a widget's `load`; `secretValue` failures surface as store rejections; compose reports skipped invalid actions and caps at `maxActions`; key resolution omits `subject` everywhere; the file store normalizes key scopes; scan helpers move out of the memory store.
- **Designer/app**: editors read live state (no stale snapshots), placeholder rows stay editor-local, helper completions are complete paths, unknown-ref diagnostics at the node, no per-node editor construction; test arguments reset with the schema; `POST /api/action-test` (an action may be named `test`) with the execution limiter and structured errors for malformed definitions; secret writes gated like listing; busy controls passed explicitly and pending banners always resolve.
- **Cleanup (no behavior change)**: remove unused imports; one shared `isPlainObject`; import `formatValue` instead of copying it; collapse `getAtPath`/`setAtPath` wrappers and the duplicated `ActionContext`; `store/refs.ts`; typed `StoreRejectionError` codes; drop `as never`/`as unknown as`/non-null assertions where a narrow suffices; `h()` generic overload; fix the stale headers and comments the review listed; document the fetch policy in the authoring guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-widgets`: untrusted-author safety (tag policy, `srcdoc`), validation (`FORBIDDEN_TAG`, prompt bind paths), bounded interpretation (per-iteration cost).
- `widget-actions`: header/query name rules, output path grammar and `"."`, declared-args-only execution with author-wins ordering, fetch deadline/204/`+json`, widget on unresolved descriptors, code-point-safe prompt cap, one context update per load chain.
- `mcp-server`: execute_action input hygiene and error hygiene, request-body cap, rate-limit configuration guard, bridge keyboard/load/cycle/timeout/alert/title/propagation semantics, notes per binding, test-call validation.
- `widget-secrets`: value rules and codes, strict envelope decoding, KEK versioning, redaction forms.
- `widget-store`: raw integrity scans, `load`-aware `putAction`, `secretValue` error shape, compose diagnostics and caps, key resolution without `subject`, file-store scope normalization.
- `widgentic-app`: test-call route, limiter and structured errors; secret writes gated; explicit busy controls.
- `widget-designer`: live-state editors, editor-local rows, complete-path helpers, node-level unknown-ref diagnostics, test-argument reset.
- `reactive-rendering`: keyboard activation on anchors; disabled descriptors not forwarded.

## Impact

- `src/templates/{guards,validate,compile}.ts`; `src/actions/{validate,execute,redact,types}.ts`; `src/mcp-server/{guarded-fetch,actions,handlers,server,app-template,rate-limit,guide,inline-images,definitions}.ts`; `src/secrets/{envelope,keyvault,types}.ts`; `src/store/{memory,file,cosmos,compose,validate,types}.ts` + new `src/store/refs.ts`; `src/reactive/mount.ts`; `src/catalog/registry.ts`; `src/designer/{action-editor,action-designer,template-panel,panels,dom}.ts`; `apps/web/{api,main,http,index.html}`; `apps/mcp-server/http.ts`; new `src/shared/plain-object.ts`.
- Tests: every fix lands with the regression test the review named as missing (see tasks §9); the full suite stays green.
- Behavior changes visible to authors: templates with forbidden tags now fail validation (none exist in stored data — verified by composing every principal's widgets during rollout); http actions whose arguments are undeclared in `input.properties` now fail with `INVALID_ACTION_INPUT`; secrets shorter than 8 bytes are refused on write (existing longer secrets unaffected); the designer's test call moves to `POST /api/action-test`.
- Deploy: one release (v56) after the full suite; no infra changes.

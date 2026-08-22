# Tasks — Streaming input preview

## 1. Template: preview pipeline

- [x] 1.1 `app-template.ts`: `tool-input-partial` + `tool-input` handlers → snapshot → preview build → mount/patch via the existing mounter, coalesced with requestAnimationFrame; `data-wgd-preview` treatment (opacity + shimmer CSS); result handoff clears it; `tool-cancelled` restores the placeholder
- [x] 1.2 Preview tree builders in template JS: card (title/subtitle/fields + fieldFormat/links), table (column union, columns/fieldFormat/links hints, caption from meta), tree (two-level labels, meta title), group (layout classes from hints, per-item dispatch); client-side `coerceData` peel (parse-gated for mid-stream strings)
- [x] 1.3 Skeleton state for custom/unknown kinds naming the kind; used for custom items inside group previews

## 2. Tests

- [x] 2.1 Partial-sequence simulations in app-template tests: growing table rows patch in place; group items appear progressively; custom kind → skeleton; result replaces preview and clears the treatment; cancellation restores placeholder; hosts sending no partials leave every existing scenario untouched
- [x] 2.2 Drift pins: for representative card/table/tree/group payloads, the preview tree carries the same `wg-*` structural classes and text content as the REAL catalog renderers (imported into the test, compared shape-wise)

## 3. Verify and ship

- [x] 3.1 Full gate; strict validation
- [x] 3.2 Rig: drive the served template in a browser with synthetic notification sequences (basic-host may not emit partials — the template is the unit under test); visual check of the shimmer treatment and the result handoff
- [x] 3.3 Deploy v45 (the probe consumed v44; its badge is removed by this build) per the KV redeploy contract; live template carries the handlers; REAL streaming verified by the user on the Apps host in a fresh conversation
- [ ] 3.4 Commit, push, memory update

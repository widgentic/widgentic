# Design — streaming input preview

## D1. The host heals; the template just reads

`ui/notifications/tool-input-partial` carries `arguments` as an already-structured object (the host heals the model's partial JSON before posting it) — the template never parses partial JSON. Each notification is a full snapshot of the arguments so far, so the preview is stateless: snapshot in, tree out, patch against the previous preview tree. The template must still treat the values as partial (a half-streamed row object simply renders its received fields), which the built-ins' total-by-design behavior already handles.

## D2. Preview builders are handwritten template JS, drift-pinned by tests

The template is a self-contained inline-JS string (the fixed, host-facing loader — the "widget content stays script-free" boundary is untouched: previews are built from DATA through the same allowlisted tree mounter). The catalog's renderers cannot be bundled in at runtime (esbuild is a devDependency; `Function.toString` injection would drag module dependency graphs). So the four preview builders (card, table, tree, group container) are handwritten in the template string, mirroring the renderers' tree shapes — exactly how the mounter already mirrors the reactive patcher. The honesty mechanism is the test suite, not the source: app-template tests execute the template JS and compare preview trees against the REAL `widget-catalog` renderers for representative payloads (same `wg-*` classes, same cell/field text). A renderer change that breaks preview fidelity fails the gate.

Deliberately out of preview scope: image inlining (server-side by definition; `img` sources render as alt placeholders until the result), `fieldFormat`/`links` hints (kept — cheap and visible — for table and card where the streamed hints are present), hint diagnostics, schema validation, named-theme resolution. `data` string-marshalling gets the same bounded peel `coerceData` applies server-side, reimplemented in template JS (small, and partial-input strings may be mid-stream JSON — peel only when it parses).

## D3. One mounter, one patcher, three states

The preview mounts through the existing `build`/`patch` functions — no second DOM path. A `data-wgd-preview` attribute on the root drives the in-progress treatment (reduced opacity + shimmer via the template's own CSS; removed when the result lands). Because the preview trees and the server's trees share shapes for built-ins, the result handoff is a normal patch — node identity preserved where rows/fields match, so the "final" render usually just removes the treatment and fills in what streaming missed (inlined images, formatted values). States: placeholder → previewing (partials) → rendered (result) → placeholder again on `tool-cancelled`.

## D4. Group previews degrade per item

A `group` preview renders the layout container from the group's own hints (same class selection as the server) and previews each item by ITS kind: built-in items get trees, custom/unknown items get the skeleton row. The 20-item cap is not enforced in preview (the server refuses at render time; the preview shows what streams).

## D5. Dormant where unsupported, verified where possible

Hosts that never send `tool-input-partial` exercise none of this — the handler simply never fires, pinned by a no-change scenario. basic-host (the reference) may not emit partials; the rig check therefore drives the template DIRECTLY in jsdom/browser by posting synthetic notification sequences, and the real-host verification is the user's live iteration on claude.ai (which streams tool input on Apps surfaces). If the live host turns out not to emit partials, the feature stays dormant plumbing at zero cost — worth stating rather than assuming.

## Risks

- **Preview/renderer drift**: covered by D2's comparison tests; residual risk is behaviors tests don't sample — accepted for a preview.
- **Rapid partial bursts**: patching per notification could thrash on very chatty hosts; the template coalesces via `requestAnimationFrame` (at most one preview build per frame).
- **Template size**: ~4–6KB of additional inline JS/CSS; well inside the resource budget.

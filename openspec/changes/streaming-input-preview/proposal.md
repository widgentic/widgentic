# Streaming input preview

## Why

While the model generates a `render_widget` call, the app frame shows a static placeholder until the server result arrives — for the payloads users actually send (a 10-row contact table, a 20-item group), that is seconds of blank frame while the agent is literally typing the data. The MCP Apps protocol streams the in-progress arguments to the frame (`ui/notifications/tool-input-partial`, host-healed into a structured object); widgentic's built-in renderers are pure data→tree functions and the template already mounts and patches trees natively — the pieces for a live "the widget draws itself while the agent types" preview all exist.

## What Changes

- The app template handles `ui/notifications/tool-input-partial` (and uses the complete `tool-input` the same way): for built-in kinds (`card`, `table`, `tree`, and `group`s of them) it builds a PREVIEW tree client-side from the partial `{ widget, data, hints }` and mounts it through the existing build/patch pipeline, restyled as visibly-in-progress; each subsequent partial patches in place, so rows/fields/items appear as the model emits them.
- Custom template kinds (and any unknown kind) get a labeled generating-state skeleton naming the kind — never a guessed render.
- The authoritative `tool-result` replaces the preview through the same patcher (matching tree shapes make the handoff near-flicker-free); the preview treatment is removed. Cancellation restores the placeholder.
- Previews are honest approximations: same `wg-*` classes and content as the real renderers for representative payloads (drift pinned by tests that compare against the actual catalog renderers), but no image inlining, no hint diagnostics, no schema validation — the result stays the only authority.
- Hosts that never send partial input see zero behavior change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: the app template loader requirement gains the streaming preview behavior.

## Impact

- `src/mcp-server/app-template.ts` — partial/tool-input handlers, preview tree builders for the four built-ins (handwritten template JS, like the existing mounter), preview styling, result handoff.
- `src/mcp-server/__tests__/app-template.test.ts` — partial-sequence simulations; drift tests comparing preview trees against the real `widget-catalog` renderers.
- No wire, tool, store, or designer changes; template size grows a few KB.

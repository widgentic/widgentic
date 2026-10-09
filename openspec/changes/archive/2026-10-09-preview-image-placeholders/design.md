## Context

The app template's previews were deliberately image-free ("the preview never emits
images"): image inlining is a server step that runs over the result only, and an
external `src` in the sandboxed frame is blocked. The cost showed live: image values
print as URL text until the result arrives.

## Decisions

### D1 — Placeholders decide exactly as the built-ins do

The bridge mirrors `resolveImage`: `hints.images[key]` is `false` (text), a hintable
shape (`avatar`/`thumb`/`hero`) or `true` (the context default) — both still requiring a
safe source (`http(s)://` or a base64 `data:image/*`) — and otherwise the value must look
like an image (`data:image/*`, or an http(s) URL whose path ends in an image extension).
Defaults: tree `icon`, card `thumb`, table `avatar`. An agreement test renders the same
payloads through core and through the bridge preview and compares which positions are
images and their shape classes, as the patcher-agreement test does for keyed patching.

### D2 — A placeholder is a classed span, not a sourceless `img`

`<span class="wg-img wg-img-<shape> wg-img-pending">` takes the shape's box and the
`.wg-img` background from the existing stylesheet; a sourceless `img` with an `alt`
renders the alt text in some engines. The result's `img` replaces the span in place
(tags differ, so the patcher rebuilds only that node).

### D3 — Server previews: the same placeholder, keyed off the source

`preview_widget` never inlines (by requirement), so its tree carries external sources.
Before mounting a server preview the bridge replaces every `img` whose `src` is not a
`data:` URI with a placeholder span keeping the image's classes. A `data:` source is
already inline and mounts as is.

### D4 — Only the trailing value can be incomplete

Snapshots keep the streamed key order, so every value except the last one in document
order is complete (the settled-name rule relies on the same fact). The bridge walks to
the last leaf of a partial snapshot; when it is a string that starts a URL — begins with
`http://`, `https://` or `data:`, or is a non-empty prefix of one of them — that leaf is
dropped from the preview (and from a server request). Text values still stream
character by character; a text that happens to begin `h`, `ht`, `htt` or `http` is
hidden for those few characters only.

## Risks / Trade-offs

- A link-valued field (`https://acme.com`) is hidden while it streams and appears once
  complete — the same moment a link becomes clickable in the result. Accepted.
- The fetch cap stays at 24 sources per render: a tree with more distinct image icons
  still leaves the lowest-priority ones external in the result. Raising it is queued
  (`BACKLOG.md`): parallel fetches bound memory by the cap (1 MiB each), so a higher cap
  wants waves that stop at the byte budget, which lengthens renders.

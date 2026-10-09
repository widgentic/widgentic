## Why

Streaming previews print image values as text. While a render's input streams, a tree
icon, a card field or a table cell that will become an image shows its URL — first
half-typed, then complete — and the result later swaps in the inlined image. Server
previews of stored widgets carry the external `src`, which the host sandbox blocks, so
they show broken images instead. The owner found it live in Claude Desktop (v82): an org
tree with 30 image icons and a card cover streamed as URL text before the result
replaced them.

## What Changes

- **Image placeholders in previews.** Wherever the result would render an image, a
  client-built preview shows a neutral placeholder of the same shape (`wg-img
  wg-img-<shape> wg-img-pending`) instead of the URL text, deciding exactly as the
  built-ins do: `hints.images` overrides by field/column, otherwise the value must
  self-identify as an image; tree icons use the `icon` shape, card fields `thumb`, table
  cells `avatar`. Server previews get the same treatment: every `img` whose source is not
  a `data:` URI mounts as a placeholder with its classes. The result's images replace the
  placeholders in place.
- **URLs still arriving are held back.** In a partial snapshot only the last value can
  still be growing; when it is a string that starts a URL (`http(s)://`, `data:`, or a
  prefix of one), the preview leaves it out until another value follows it or the input
  completes, so no half-typed URL is ever shown or sent to `preview_widget`.
- The template's stylesheet gives placeholders a box: the shape classes already size
  avatars, thumbs and icons; a pending hero reserves a 16:9 box.
- Not changed: the per-render fetch cap of 24 image sources. Raising it trades server
  memory and render latency and is queued in `BACKLOG.md` with that analysis.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: previews show image placeholders and hold back URLs still arriving
  (ADDED requirement).

## Impact

- `packages/mcp/src/server/app-template.ts` (bridge preview builders, a tree transform for
  server previews, the trailing-URL rule, CSS); its tests.
- `@widgentic/mcp` patch changeset; `BACKLOG.md` (fetch-cap item); `TESTING.md` entry.

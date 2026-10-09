## ADDED Requirements

### Requirement: Previews hold image places

The app template's streaming previews SHALL never show an image source as text and
SHALL never mount an external image source. In a client-built preview, every position
where the built-in renderer would emit an image — a tree node's `icon` (shape `icon`), a
card field (default shape `thumb`) or a table cell (default shape `avatar`), decided
exactly as the renderer decides: `hints.images[key]` `false` suppresses, a hintable shape
or `true` forces an image when the source is safe (`http(s)://` or base64
`data:image/*`), otherwise the value must self-identify as an image — SHALL mount a
placeholder element carrying `wg-img wg-img-<shape> wg-img-pending` and no source. A
server preview's tree SHALL mount every `img` whose `src` is not a `data:` URI as such a
placeholder keeping the image's classes. In a partial snapshot, the last value in
document order SHALL be left out of the preview, and out of any `preview_widget`
request, while it is a string that begins `http://`, `https://` or `data:` or is a
non-empty prefix of one of those; once another value follows it or the input completes
it SHALL be previewed under the rules above. The template's stylesheet SHALL give a
pending `hero` a reserved box; the result's images SHALL replace placeholders when the
tool result renders.

#### Scenario: A tree icon previews as an icon placeholder

- **WHEN** a partial `tree` input carries a node whose settled `icon` is `https://example.com/a.png`
- **THEN** the preview shows the node's label beside an element with classes `wg-img wg-img-icon wg-img-pending` and no URL text, and an emoji icon still previews as text

#### Scenario: Card and table images decide as the renderer does

- **WHEN** card fields and table cells carry an image-extension URL, an extensionless URL hinted `hints.images: { cover: "hero" }`, a URL hinted `false`, and a non-image link
- **THEN** the preview shows placeholders exactly where the rendered result has images, with the same shape classes (`thumb` by default for cards, `avatar` for tables, `hero` when hinted), and text elsewhere

#### Scenario: A URL still arriving is held back

- **WHEN** a partial snapshot ends with a card field whose value is `https://images.example.com/pho`
- **THEN** that field is absent from the preview and from any `preview_widget` request, and once a later field follows it the field previews as a placeholder

#### Scenario: Text keeps streaming

- **WHEN** a partial snapshot ends with a title `Medellín Tech`
- **THEN** the preview shows `Medellín Tech`

#### Scenario: Server previews never mount external sources

- **WHEN** a `preview_widget` answer's tree has an `img` with an `https` source and another with a `data:image/png;base64,` source
- **THEN** the first mounts as a `wg-img-pending` placeholder keeping its classes and the second mounts as an `img` with its source

#### Scenario: The result replaces the placeholders

- **WHEN** the tool result arrives after a preview with placeholders
- **THEN** the widget shows the result's images and no element carries `wg-img-pending`

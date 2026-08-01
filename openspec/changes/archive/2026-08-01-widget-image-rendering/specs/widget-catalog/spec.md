# widget-catalog — Delta: image rendering

## ADDED Requirements

### Requirement: Image rendering in card and table
The `card` and `table` renderers SHALL render a string value as an image element when it is a safe image source and either auto-detection or a hint selects image treatment. A value auto-detects as an image when `isSafeImageSrc` passes and the value is a `data:image/*` URI or an `http(s)` URL whose pathname ends in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, or `.svg` (query strings tolerated). `hints.images: Record<string, "avatar" | "thumb" | "hero" | true | false>` SHALL override per card-field / table-column key: a shape string forces image treatment with that shape, `true` forces the context default shape, and `false` suppresses detection so the value renders as text. Hints SHALL NOT bypass safety: a value failing `isSafeImageSrc` renders as text regardless of hints. The default shape SHALL be `avatar` in table cells and `thumb` in card fields. The emitted element SHALL be `img` with classes `wg-img wg-img-<shape>`, the value as `src`, the field/column key as `alt`, and `loading="lazy"` / `decoding="async"`; image treatment takes precedence over `hints.fieldFormat` for the same key.

#### Scenario: Avatar URL auto-detects in a table cell
- **WHEN** `table` renders `data: [{ user: "Ada", avatar: "https://cdn.example/a/ada.png" }]`
- **THEN** the `avatar` cell SHALL contain an `img` element with class `wg-img wg-img-avatar`, `src` equal to the URL, and `alt` `"avatar"`
- **AND** the `user` cell SHALL render text as before

#### Scenario: Card field renders a thumbnail by default
- **WHEN** `card` renders `data: { fields: { photo: "https://cdn.example/p.jpg" } }`
- **THEN** the `photo` field value SHALL contain an `img` element with class `wg-img wg-img-thumb`

#### Scenario: Hint forces a shape for an extensionless URL
- **WHEN** `card` renders `data: { fields: { cover: "https://images.example/id/12345" } }` with `hints: { images: { cover: "hero" } }`
- **THEN** the `cover` field SHALL contain an `img` element with class `wg-img wg-img-hero` even though the URL has no image extension

#### Scenario: Hint false suppresses detection
- **WHEN** `table` renders a column of `.png` URLs with `hints: { images: { screenshot: false } }`
- **THEN** the `screenshot` cells SHALL contain the URL as text and no `img` element

#### Scenario: Unsafe source never renders as an image
- **WHEN** a field value is `javascript:alert(1)` and `hints: { images: { x: "avatar" } }` targets it
- **THEN** the output SHALL contain no `img` element for that field and the value renders as escaped text

#### Scenario: data URI image renders
- **WHEN** a field value is `data:image/png;base64,iVBORw0KGgo=` (any valid `data:image/*` payload)
- **THEN** the field SHALL contain an `img` element with that value as `src`

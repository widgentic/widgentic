# widget-catalog — Delta: hint-coherence analysis

## ADDED Requirements

### Requirement: Hint-coherence analysis
The catalog SHALL export a pure `analyzeHints(kind, data, hints, descriptor)` that inspects a render request without rendering it and returns an array of never-fatal diagnostics `{ hint, code, message, suggestion? }` with codes `UNKNOWN_HINT`, `NO_MATCH`, `INVALID_VALUE`, and `UNSAFE_IMAGE_SOURCE`. It SHALL report: top-level hint keys not advertised in the descriptor's `hints` (adding a `suggestion` when an advertised key is within Levenshtein distance 2); `columns`, `fieldFormat`, and `images` entries whose key matches no column or field in the supplied `data`; `images` values outside `"avatar" | "thumb" | "hero" | true | false`; values targeted by an image hint that fail `isSafeImageSrc`; and non-number `expandDepth`. Analysis SHALL never throw, never mutate inputs, and never affect rendering; renderers SHALL remain unaware of it. An empty or absent `hints` SHALL produce no diagnostics.

#### Scenario: Unknown hint gets a spelling suggestion
- **WHEN** `analyzeHints("table", [{ a: 1 }], { colums: ["a"] }, tableDescriptor)` is called
- **THEN** the result SHALL contain a diagnostic with `code: "UNKNOWN_HINT"`, `hint: "colums"`, and `suggestion: "columns"`

#### Scenario: Hint keys that match no data are reported
- **WHEN** `analyzeHints("card", { fields: { price: 1 } }, { fieldFormat: { cost: "${value}" } }, cardDescriptor)` is called
- **THEN** the result SHALL contain a diagnostic with `code: "NO_MATCH"` for `fieldFormat.cost`

#### Scenario: Invalid image shape and unsafe source are distinct codes
- **WHEN** `images: { photo: "big" }` targets an existing field, and `images: { x: "avatar" }` targets a field whose value is `javascript:alert(1)`
- **THEN** the first SHALL yield `INVALID_VALUE` and the second `UNSAFE_IMAGE_SOURCE`

#### Scenario: Coherent hints are silent
- **WHEN** `analyzeHints("table", [{ a: 1, avatar: "https://cdn.example/a.png" }], { columns: ["a", "avatar"], images: { avatar: true } }, tableDescriptor)` is called
- **THEN** the result SHALL be an empty array

#### Scenario: Analysis is total
- **WHEN** `analyzeHints` receives garbage (`data: null`, `hints: 42`, missing descriptor)
- **THEN** it SHALL return an array without throwing

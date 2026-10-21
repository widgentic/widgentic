## ADDED Requirements

### Requirement: Previews compose links as the result does
The app template's client-built previews of `card` fields and `table` cells SHALL compose a `hints.links` prefix with the value by the same URL-value rule the renderer uses, so a streamed preview links exactly the `href` its tool result will carry.

#### Scenario: A streamed table links the encoded href
- **WHEN** a streamed `table` render with `hints: { links: { q: "https://search.example.com/?q=" } }` previews the row `{ q: "a&b c" }`
- **THEN** the preview's cell SHALL link `https://search.example.com/?q=a%26b%20c`, as the tool result's tree does

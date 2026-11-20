## ADDED Requirements

### Requirement: A host may admit its own origin on the pages
The authorization surface SHALL accept, at construction, the kinds of asset its pages may load from the pages' own origin: styles, fonts, images and scripts, each named separately. For each kind named, the policy of every page the surface serves SHALL admit that kind from the page's own origin; for each kind not named it SHALL admit none, and with no kind named the policy SHALL be exactly the one served without the option. The option SHALL NOT be able to admit any other origin, inline script, `data:` or `blob:` sources, or framing, and SHALL NOT make a page cacheable; inline styles SHALL remain admitted only by the hash of the blocks the page carries. An unknown kind SHALL be refused at construction.

#### Scenario: The default admits nothing
- **WHEN** the surface is constructed without the option and a page is served
- **THEN** its policy SHALL be `default-src 'none'` with the page's inline style hashes, and SHALL name no origin

#### Scenario: A host brands its pages from its own origin
- **WHEN** the surface is constructed admitting styles, fonts, images and scripts, and its host renders a page that links a stylesheet, a font, an image and a script by same-origin paths
- **THEN** the page's policy SHALL admit each of those four kinds from `'self'`, and SHALL still carry the hash of the page's inline style block

#### Scenario: Only what was named
- **WHEN** the surface is constructed admitting styles and fonts only
- **THEN** the policy SHALL admit styles and fonts from `'self'` and SHALL admit no image and no script source

#### Scenario: The rest of the policy does not move
- **WHEN** every kind is admitted
- **THEN** the policy SHALL contain no `'unsafe-inline'`, no `'unsafe-eval'`, no scheme source and no host source, framing SHALL remain forbidden, and the page SHALL remain uncacheable

#### Scenario: An unknown kind is refused
- **WHEN** the surface is constructed with a kind it does not know
- **THEN** construction SHALL fail naming the kind

## MODIFIED Requirements

### Requirement: Widget listing tool
`handleListWidgets(catalog)` SHALL return a non-error result whose text content is the JSON array of the catalog's descriptors, so agents can discover available widgets, their purpose, and the expected `data` input.

#### Scenario: Listing reflects the catalog
- **WHEN** `handleListWidgets` runs on a catalog with the built-ins and a registered `invoice` template kind
- **THEN** parsing the result text SHALL yield descriptors for `card`, `table`, `tree`, `group`, and `invoice`

#### Scenario: Listing carries agent-usable metadata
- **WHEN** the built-in `table` descriptor is read from the listing
- **THEN** it SHALL include `description`, `dataShape`, and a `dataExample` an agent can imitate

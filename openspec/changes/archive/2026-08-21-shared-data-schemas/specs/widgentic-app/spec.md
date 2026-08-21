# widgentic-app — data schemas join the managed sections

## MODIFIED Requirements

### Requirement: Writes are authorized by session, never by API key
The authoring API (widgets, themes, schemas, keys) SHALL accept only a validated session token. Presenting an MCP API key to a write endpoint SHALL be refused with `401`, regardless of the key's scopes. Every write SHALL be attributed to the session's principal — a request SHALL NOT be able to name a different principal as its target.

#### Scenario: An MCP key cannot write
- **WHEN** a request presents a valid MCP API key (and no session) to any authoring endpoint
- **THEN** the response SHALL be `401` and nothing SHALL be persisted

#### Scenario: A session cannot write into another principal
- **WHEN** an authenticated request supplies a principal id other than its own
- **THEN** the write SHALL be refused or applied to the session's own principal, never to the named one

#### Scenario: Stored entries pass the store's rules
- **WHEN** a widget, theme, or schema is submitted through the API
- **THEN** it SHALL be validated by the same rules the store enforces (template validity, reserved kinds, limits)
- **AND** a rejected entry SHALL return a structured error naming the rule, leaving existing entries untouched

### Requirement: Designing and publishing are the same act
The app SHALL host the widget designer and the theme designer against persistence: saving in the designer SHALL write through the authoring API to the signed-in principal's store, and the entry SHALL then appear in that principal's MCP catalog without any further step. The app SHALL load the principal's existing widgets and themes into the designers, and SHALL offer the principal's themes as the widget designer's preview options. Selecting a stored entry from the list SHALL open it in the designer in read-only mode — editing disabled, preview and preview selectors live — with `Edit` and `Delete` as the entry's actions. `Edit` SHALL switch the designer to edit mode: the entry's actions become `Save` and `Cancel`, and the `New` control SHALL be hidden while an existing entry is under edit. `Save to my catalog` SHALL be visible only while designing a NEW entry — selecting a stored entry hides it (that entry saves through its own row), and it returns when `New` is pressed. The app SHALL also supply the principal's stored widgets to the theme designer so its preview-kind selector covers their own widgets, not only the built-in kinds. `Save` SHALL persist through the authoring API and return to read-only mode; `Cancel` SHALL discard the edits and restore the stored entry in read-only mode. Data schemas SHALL be a managed section under the same regime: listed beside widgets and themes, opened read-only on selection with `Edit`/`Delete`, edited through the hosted schema designer with the same `Save`/`Cancel` row actions and the same new-drafts-only `Save to my catalog` rule, persisted through session-authorized schema routes. The app SHALL supply the principal's schemas to the widget designer so drafts can reference them, and the store's referenced-schema deletion refusal SHALL surface to the user naming the referencing widgets — never as a silent failure.

#### Scenario: A saved widget appears in the caller's catalog
- **WHEN** a signed-in user saves a widget in the designer and then calls `list_widgets` with one of their keys
- **THEN** the saved kind SHALL appear in that listing
- **AND** it SHALL NOT appear for any other principal or for the anonymous catalog

#### Scenario: A saved theme is selectable and renderable
- **WHEN** a user saves a theme and calls `render_widget` with `theme: "<its name>"` using their key
- **THEN** the theme SHALL resolve and apply
- **AND** `list_themes` SHALL include it for that principal only

#### Scenario: Existing entries load back into the designers
- **WHEN** a signed-in user opens the designers
- **THEN** their stored widgets and themes SHALL be listed and loadable for editing

#### Scenario: Selecting a stored entry opens it read-only
- **WHEN** a stored widget or theme is selected from its list
- **THEN** the designer SHALL load it read-only with the preview live
- **AND** the entry SHALL offer `Edit` and `Delete`

#### Scenario: Edit mode swaps the actions and hides the top controls
- **WHEN** `Edit` is clicked on the selected entry
- **THEN** the designer SHALL become editable and the entry's actions SHALL become `Save` and `Cancel`
- **AND** the `New` and `Save to my catalog` controls SHALL be hidden until the edit ends

#### Scenario: Save to my catalog belongs to new entries only
- **WHEN** a stored entry is selected (read-only or under edit)
- **THEN** `Save to my catalog` SHALL be hidden
- **AND WHEN** `New` is pressed
- **THEN** it SHALL be visible again

#### Scenario: The theme designer previews the principal's own widgets
- **WHEN** a signed-in user with a stored widget opens the theme designer
- **THEN** that widget's kind SHALL be selectable in the preview-kind selector

#### Scenario: Cancel abandons the edits
- **WHEN** `Cancel` is clicked during an edit
- **THEN** the designer SHALL show the stored entry unchanged, back in read-only mode

#### Scenario: Schemas are a managed section
- **WHEN** a signed-in user saves a `person` schema
- **THEN** it SHALL appear in the Data schemas list, opening read-only on selection with `Edit` and `Delete`
- **AND** it SHALL be selectable in the widget designer's shared-schema mode

#### Scenario: A schema edit propagates to referencing widgets
- **WHEN** a stored `person-card` widget references the `person` schema and the schema is edited and saved
- **THEN** the next render of `person-card` through the principal's MCP catalog SHALL validate against the updated schema, without the widget itself being touched

#### Scenario: Deleting a referenced schema is refused with the widgets named
- **WHEN** `Delete` is pressed on a schema that stored widgets reference
- **THEN** the deletion SHALL be refused and the error shown SHALL name the referencing widgets
- **AND** the schema SHALL remain listed and intact

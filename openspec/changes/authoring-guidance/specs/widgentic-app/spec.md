# widgentic-app — view first, edit deliberately

## MODIFIED Requirements

### Requirement: Designing and publishing are the same act
The app SHALL host the widget designer and the theme designer against persistence: saving in the designer SHALL write through the authoring API to the signed-in principal's store, and the entry SHALL then appear in that principal's MCP catalog without any further step. The app SHALL load the principal's existing widgets and themes into the designers, and SHALL offer the principal's themes as the widget designer's preview options. Selecting a stored entry from the list SHALL open it in the designer in read-only mode — editing disabled, preview and preview selectors live — with `Edit` and `Delete` as the entry's actions. `Edit` SHALL switch the designer to edit mode: the entry's actions become `Save` and `Cancel`, and the `New` and `Save to my catalog` controls SHALL be hidden while an existing entry is under edit. `Save` SHALL persist through the authoring API and return to read-only mode; `Cancel` SHALL discard the edits and restore the stored entry in read-only mode.

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

#### Scenario: Cancel abandons the edits
- **WHEN** `Cancel` is clicked during an edit
- **THEN** the designer SHALL show the stored entry unchanged, back in read-only mode

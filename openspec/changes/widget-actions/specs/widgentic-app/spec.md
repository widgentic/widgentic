# widgentic-app — widget-actions delta

## ADDED Requirements

### Requirement: Actions section
The app SHALL offer an Actions section beside Widgets, Themes and Schemas where a signed-in person creates, edits and deletes their shared actions. An http action SHALL be savable only after a test call succeeds: the app builds an input form from the action's input schema (pre-filled from the schema's example where present), runs the call **through the same server-side execution path production uses** (never from the browser), and requires the response to validate against the output schema; the test result SHALL be shown with secret values redacted. A prompt action SHALL show, at save, an explicit notice that the proposed message content is the author's responsibility and will be placed in the user's composer for them to send. Deleting an action in use SHALL be refused with the referencing widgets named. Writes SHALL be authorized by session, never by API key, as for every other entity.

#### Scenario: An http action must prove itself before saving
- **WHEN** a person fills in an http action and clicks Save without a successful test call
- **THEN** Save SHALL be unavailable and the app SHALL say a passing test call is required
- **AND WHEN** the test call succeeds and its response validates
- **THEN** Save SHALL be available and the action SHALL persist

#### Scenario: A test call is a production-path call
- **WHEN** a test call runs
- **THEN** it SHALL be performed server-side with the same SSRF guard, secret injection and response validation as `execute_action`, and its displayed result SHALL contain `***` in place of any secret value

#### Scenario: Prompt actions carry a responsibility notice
- **WHEN** a prompt action is saved
- **THEN** the app SHALL have shown the notice and SHALL record acknowledgement with the save

### Requirement: Secrets section is write-only
The app SHALL offer a Secrets section where a person sets, replaces and deletes named secrets through a password-style field. After entry the app SHALL never display a value, a preview or a length; the list SHALL show names and timestamps only. Deleting a secret in use SHALL be refused with the referencing actions named.

#### Scenario: A saved secret is never shown again
- **WHEN** a secret is set and the section reloads
- **THEN** the list SHALL show its name and timestamps and the app SHALL offer Replace and Delete, never Show or Copy

### Requirement: Key scopes are chosen at creation
The key-creation form SHALL offer the `execute` scope as an explicit opt-in (`read` is always granted), SHALL explain that `execute` lets widgets run http actions with the principal's secrets, and SHALL show each key's scopes in the list. Scopes SHALL NOT be editable after creation — granting `execute` to an existing integration means creating a new key.

#### Scenario: Execute is opt-in
- **WHEN** a key is created with the default form
- **THEN** it SHALL carry `["read"]`
- **AND WHEN** the person ticks Execute
- **THEN** it SHALL carry `["read", "execute"]` and the list SHALL show that

## MODIFIED Requirements

### Requirement: Designing and publishing are the same act
The app SHALL host the widget designer and the theme designer against persistence: saving in the designer SHALL write through the authoring API to the signed-in principal's store, and the entry SHALL then appear in that principal's MCP catalog without any further step. The app SHALL load the principal's existing widgets and themes into the designers, and SHALL offer the principal's themes as the widget designer's preview options. Selecting a stored entry from the list SHALL open it in the designer in read-only mode — editing disabled, preview and preview selectors live — with `Edit` and `Delete` as the entry's actions. `Edit` SHALL switch the designer to edit mode: the entry's actions become `Save` and `Cancel`, and the `New` control SHALL be hidden while an existing entry is under edit. `Save to my catalog` SHALL be visible only while designing a NEW entry — selecting a stored entry hides it (that entry saves through its own row), and it returns when `New` is pressed. Stored widget and theme rows SHALL additionally offer `Copy`: it opens the designer in NEW mode seeded with a copy of that entry under a distinct identity (the source untouched), so `Save to my catalog` creates a separate entry. The `New` control for widgets SHALL also offer starting from a built-in (`card`, `table`, `tree`) via the seeded starter templates, and for themes from the `light`/`dark` presets; seeded identities SHALL avoid the principal's existing kinds/names. The app SHALL also supply the principal's stored widgets to the theme designer so its preview-kind selector covers their own widgets, not only the built-in kinds. `Save` SHALL persist through the authoring API and return to read-only mode; `Cancel` SHALL discard the edits and restore the stored entry in read-only mode. Data schemas SHALL be a managed section under the same regime: listed beside widgets and themes, opened read-only on selection with `Edit`/`Delete`, edited through the hosted schema designer with the same `Save`/`Cancel` row actions and the same new-drafts-only `Save to my catalog` rule, persisted through session-authorized schema routes. The app SHALL supply the principal's schemas to the widget designer so drafts can reference them, and the store's referenced-schema deletion refusal SHALL surface to the user naming the referencing widgets — never as a silent failure. Actions SHALL be a managed section under the same regime — listed beside widgets, themes and schemas, opened read-only on selection with `Edit`/`Delete`, edited through the hosted action designer with the same `Save`/`Cancel` row actions and the same new-drafts-only `Save to my catalog` rule, persisted through session-authorized action routes — with the test-call and prompt-notice rules of the Actions section requirement. The app SHALL supply the principal's shared actions and secret names to the widget designer so drafts can bind elements: binding an element SHALL offer the shared actions by name or an inline definition (`{ definition }`), an input mapping editor listing the action's input fields (each a template path — with `$root`, `$parent` and `$index` available — or a constant), and the output mode with its `path`/`map` fields; the widget-level `load` binding SHALL be offered for http GET actions only; the designer preview SHALL render bound elements with an inert badge (nothing executes from a preview). The store's referenced-action and referenced-secret deletion refusals SHALL surface to the user naming the referencing entries, exactly as the schema refusal does.

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

#### Scenario: Copy seeds a new widget
- **WHEN** `Copy` is clicked on a stored `person-card` row
- **THEN** the designer SHALL open editable in NEW mode with a copy of the widget under a different kind
- **AND** `Save to my catalog` SHALL create the new entry while `person-card` remains unchanged

#### Scenario: Copy seeds a new theme
- **WHEN** `Copy` is clicked on a stored theme row
- **THEN** the theme designer SHALL open in NEW mode with the tokens copied under a distinct, non-reserved name

#### Scenario: New from a built-in or preset
- **WHEN** the user starts a new widget from `table` or a new theme from `dark`
- **THEN** the designer SHALL open with the corresponding seeded starter, rendering recognizably like the source before any edit

#### Scenario: Actions are a managed section
- **WHEN** a signed-in user saves a `refresh` http action
- **THEN** it SHALL appear in the Actions list, opening read-only on selection with `Edit` and `Delete`
- **AND** it SHALL be offered by name when binding an element in the widget designer

#### Scenario: A bound widget publishes its bindings
- **WHEN** a widget whose button binds a shared action is saved and rendered under an `execute` key
- **THEN** the rendered element SHALL carry the action descriptor with arguments resolved from the render's data

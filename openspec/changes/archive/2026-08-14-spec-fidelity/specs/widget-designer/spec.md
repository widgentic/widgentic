# widget-designer — the preview mechanism, as actually built

## MODIFIED Requirements

### Requirement: Live preview through the real pipeline
The designer SHALL preview the draft continuously through widgentic's own pipeline: the draft template compiled by the public template compiler and registered into a scratch catalog (built-ins always present; registration via `catalog.register` with a compile delegate, so one mounted preview survives every recompile), rendered with `mountWidget` against `dataExample` or user-supplied sample data, under the currently selected theme — updates patching the existing DOM in place. When the draft is invalid, the preview SHALL freeze the last good render and show the structured error in a banner; it SHALL never show a blank or stale-placeholder state.

#### Scenario: Valid edits patch the preview in place
- **WHEN** a text node's content changes in a valid draft
- **THEN** the preview SHALL update without replacing the mounted root element

#### Scenario: Invalid drafts keep the last good preview
- **WHEN** the template becomes invalid mid-edit
- **THEN** the last valid preview SHALL remain visible with the validation error banner shown

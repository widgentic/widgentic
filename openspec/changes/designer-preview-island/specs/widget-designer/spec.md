## ADDED Requirements

### Requirement: Preview island
The widget designer and the theme designer SHALL accept `previewFrame`, a URL, in their options. Their custom elements SHALL accept it as a `preview-frame` attribute, read when the element connects. With it, the preview SHALL render in its own framed document.
- **The frame.** The preview pane SHALL hold one iframe whose `src` is that URL and whose `sandbox` is exactly `allow-scripts`, so the document runs in an opaque origin. The frame SHALL NOT be reloaded between revisions. Its height SHALL follow the size the frame reports.
- **The host protocol.** The designer SHALL answer the frame as a minimal MCP Apps host:
  - `ui/initialize` is answered with a host context and no host capabilities, so the frame offers no server tools. The host context's `theme` is the designer's color scheme (`light` or `dark`), and its `styles.variables` carry every host style variable the app template bridges, valued from the built-in theme of that scheme, as a host hands a frame its own palette. A change of scheme SHALL be sent as `ui/notifications/host-context-changed` with the same two fields;
  - `ping` is answered;
  - messages to the frame are held until it sends `ui/notifications/initialized`.
- **Each revision.** For each previewable revision, the designer SHALL send one `ui/notifications/tool-result` whose `structuredContent` carries:
  - the tree rendered through the live-preview pipeline;
  - the CSS: the preview theme's styles, the previewed kind's styles, then the preview theme's token declarations, the order a render's `css` uses;
  - the designer's own rule marking action-bound elements.

  A revision that is not previewable SHALL send nothing. The frame keeps the last good render, and the banner and empty state stay in the designer's own document.
- **Never executes.** A frame request to call a tool SHALL be answered with a JSON-RPC error, and no request SHALL leave the designer. A `ui/message` request SHALL be answered without composing anything. A `ui/open-link` request SHALL open the URL in a new browsing context only when it passes the template URL guard (`http`, `https`, `mailto`, `tel`); any other URL SHALL be refused.
- **Strangers ignored.** Messages from any window other than the frame SHALL be ignored.
- **Fallback.** Without `previewFrame`, the designers SHALL preview in the page exactly as before.

#### Scenario: The preview renders in the frame
- **WHEN** a widget designer is created with `previewFrame: "/api/preview-frame"` and a valid draft, and the frame initializes
- **THEN** the preview pane SHALL hold an iframe with that `src` and `sandbox="allow-scripts"`
- **AND** the designer SHALL send a `ui/notifications/tool-result` whose `structuredContent.tree` equals the in-page pipeline's render of the same draft, and whose `css` carries the draft's styles after the preview theme's styles

#### Scenario: Edits patch through the same frame
- **WHEN** a valid edit follows the first render
- **THEN** the designer SHALL send one more `tool-result`, and the iframe element and its `src` SHALL be unchanged

#### Scenario: An invalid draft sends nothing
- **WHEN** the template becomes invalid mid-edit
- **THEN** no `tool-result` SHALL be sent, and the banner SHALL show the structured error

#### Scenario: The preview never executes
- **WHEN** the frame requests `tools/call` for `execute_action`
- **THEN** the designer SHALL answer with a JSON-RPC error, and no network request SHALL be made

#### Scenario: Links open outside, unsafe ones never
- **WHEN** the frame requests `ui/open-link` with `https://example.com/a`, then with `javascript:alert(1)`
- **THEN** the first SHALL open in a new browsing context, and the second SHALL be refused

#### Scenario: The frame's size sets the iframe height
- **WHEN** the frame reports `ui/notifications/size-changed` with height 480
- **THEN** the iframe's height SHALL become 480 px

#### Scenario: Messages from elsewhere are ignored
- **WHEN** a window other than the frame posts a `ui/initialize` request or a size change
- **THEN** the designer SHALL neither answer nor change anything

#### Scenario: The frame follows the designer's color scheme
- **WHEN** the page's `<html>` carries `data-theme="dark"` and the frame initializes
- **THEN** the host context's `theme` SHALL be `dark`, and its `--color-background-primary` variable SHALL be the built-in dark theme's `bg`
- **AND WHEN** the page switches to `light`
- **THEN** the designer SHALL send `ui/notifications/host-context-changed` with `theme: "light"` and the default `bg`

#### Scenario: Without a frame, the preview is unchanged
- **WHEN** a designer is created without `previewFrame`
- **THEN** the preview SHALL mount in the page, as today, with no iframe

## MODIFIED Requirements

### Requirement: Live preview through the real pipeline
The designer SHALL preview the draft continuously through widgentic's own pipeline: the draft template compiled by the public template compiler and registered into a scratch catalog (built-ins always present; registration via `catalog.register` with a compile delegate, so one mounted preview survives every recompile), rendered with `mountWidget` against `dataExample` or user-supplied sample data, under the currently selected theme — updates patching the existing DOM in place. In island mode (requirement "Preview island") the same pipeline renders the tree, and the frame's bridge mounts and patches it in place instead of `mountWidget` in the page. When the draft is invalid, the preview SHALL freeze the last good render and show the structured error in a banner; it SHALL never show a blank or stale-placeholder state — including on the FIRST render, where there is no last good render to freeze on (an invalid or reserved-kind `initialWidget` must still leave a legible pane, not an empty one).

#### Scenario: Valid edits patch the preview in place
- **WHEN** a text node's content changes in a valid draft
- **THEN** the preview SHALL update without replacing the mounted root element

#### Scenario: Invalid drafts keep the last good preview
- **WHEN** the template becomes invalid mid-edit
- **THEN** the last valid preview SHALL remain visible with the validation error banner shown

#### Scenario: An invalid initial draft never renders blank
- **WHEN** a designer is created with an `initialWidget` whose template fails validation, or whose `kind` is a reserved built-in
- **THEN** the preview pane SHALL show an explicit empty state rather than nothing, with the structured error in the banner

### Requirement: Theme styles in the widget designer's preview
When the widget designer's preview theme is a supplied entry carrying `styles`, the preview SHALL apply those styles beneath the draft's own descriptor styles, so classes a theme defines (a shared `.wg-btn`, say) look in the draft as they will in a render under that theme. Choosing "none" SHALL apply no theme styles. The selection SHALL still never reach the exported widget. Every style a designer preview emits — the theme's and the widget's own, in the widget designer and in the theme designer — SHALL be scoped to that preview at no added weight while the preview shares the host page's DOM (the in-page mode): a widget's rule SHALL NOT reach a matching element elsewhere on the page. In island mode the preview has its own document, so the styles SHALL be emitted unscoped, exactly as a render emits them, and the page SHALL receive neither core's widget stylesheet nor the in-page preview's own rules.

#### Scenario: A preview theme's shared class dresses the draft
- **WHEN** the preview theme defines `.wg-btn { color: rgb(1, 2, 3) }` and the draft's template renders a `button` with class `wg-btn`
- **THEN** the previewed button's computed color SHALL be `rgb(1, 2, 3)`
- **AND** a draft style `.wg-btn { color: rgb(4, 5, 6) }` SHALL win, and choosing "none" SHALL remove the theme's rule

#### Scenario: A widget's own styles stay in the preview
- **WHEN** the draft's styles color `.wg-title` and the page holds another `.wg-title` element outside the designer
- **THEN** the previewed title SHALL take the color and the element outside SHALL NOT

#### Scenario: The island emits styles unscoped
- **WHEN** a widget designer with a `previewFrame` previews a draft whose styles color `.wg-title`, and the page holds another `.wg-title` element outside the designer
- **THEN** the CSS the designer sends to the frame SHALL carry the rule with the selector `.wg-title`, unscoped
- **AND** the element outside SHALL NOT take the color
- **AND** the page SHALL carry no widget stylesheet and no in-page preview rule

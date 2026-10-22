## MODIFIED Requirements

### Requirement: Default themes from settings stand in for the built-ins
When a `render_widget` or `preview_widget` input names no `theme`, each mode for which the rendered widget names no theme of its own (requirement "A widget's own themes take priority over the defaults") SHALL use the caller's registry default for that mode. For the template channel's `structuredContent.css`: a light default other than the built-in `light` SHALL contribute its token declarations under `:root:not([data-theme="dark"])`, and a dark default other than the built-in `dark` its declarations under `:root[data-theme="dark"]`; when both defaults carry styles each one's styles SHALL be scoped to its mode, and otherwise the styles of the one default that carries them SHALL apply in both modes, since they are layout a widget relies on and read the active mode's tokens; one theme that is the default for both modes SHALL be emitted as an explicitly named theme is, applying in both modes. A mode whose default is the built-in SHALL contribute no token declarations, keeping today's token behavior for that mode — the host's bridged values and, on dark hosts, the template's dark overrides. The `format: "page"` and `format: "app"` documents and the `ui://widgentic/page/{kind}` page, which carry no host theme, SHALL use the light mode's theme — the widget's own, else the light default — with its tokens and styles unscoped, and SHALL ignore the dark mode's. A `preview_widget` input whose `theme` does not resolve (a name still streaming) SHALL preview with no theme at all, not with the defaults. An explicit `theme` input SHALL replace the defaults in every mode. With both defaults built-in, every output SHALL be byte-identical to a render made before default themes existed.

#### Scenario: The light default dresses light hosts only
- **WHEN** a caller's light default is `brand` (`accent: "#ff5a1f"`) and its dark default is the built-in, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `--wg-accent: #ff5a1f` under `:root:not([data-theme="dark"])` and nothing under `:root[data-theme="dark"]`
- **AND** in the app template on a host whose theme is dark, the widget's computed accent SHALL equal the built-in dark behavior's (a render with no defaults), and on a light host it SHALL be `#ff5a1f`

#### Scenario: The dark default dresses dark hosts only
- **WHEN** a caller's dark default is `brand-dark` with styles defining `.wg-btn`, its light default the built-in, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `brand-dark`'s tokens under `:root[data-theme="dark"]` only, and its `.wg-btn` rule unscoped

#### Scenario: A default's styles serve both modes when the other default has none
- **WHEN** the light default is `brand` (styles defining `.wg-btn`) and the dark default is `night`, a theme without styles, or the built-in
- **THEN** `brand`'s `.wg-btn` rule SHALL be unscoped, so dark hosts keep the layout

#### Scenario: Two different defaults each scope their styles
- **WHEN** the light default is `brand` and the dark default `brand-dark`, both defining `.wg-btn`
- **THEN** `brand`'s rule SHALL be under `:where(:root:not([data-theme="dark"])) .wg-btn` and `brand-dark`'s under `:where(:root[data-theme="dark"]) .wg-btn`, and in the app template a `.wg-btn` SHALL take each theme's padding on hosts of its mode

#### Scenario: A theme still streaming previews with none
- **WHEN** `preview_widget` runs with `theme: "bra"` for a caller whose light default is `brand`
- **THEN** its `css` SHALL carry none of `brand`'s declarations

#### Scenario: An explicit theme replaces the defaults
- **WHEN** a caller with both defaults set renders with `theme: "dark"`
- **THEN** the output SHALL carry the built-in dark theme as an explicit render does today and none of the default themes' declarations or styles

#### Scenario: Documents use the light default
- **WHEN** a caller with both defaults set renders with `format: "page"` and no `theme`
- **THEN** the document SHALL carry the light default's tokens under `:root` and its styles unscoped, and none of the dark default's

#### Scenario: No defaults, no change
- **WHEN** a caller whose settings choose no default themes renders the same payload before and after this change, in every format
- **THEN** the outputs SHALL be byte-identical

#### Scenario: Previews follow the defaults
- **WHEN** `preview_widget` runs with no `theme` for a caller whose light default is `brand`
- **THEN** its `css` SHALL carry `brand`'s light-scoped declarations exactly as the render's does

## ADDED Requirements

### Requirement: A widget's own themes take priority over the defaults
When a render, a preview, an action's re-render or a widget page names no `theme`, each mode SHALL wear, in order: the theme the rendered widget's `descriptor.themes` names for that mode, then the caller's Settings default for that mode, then the built-in. An explicit `theme` input SHALL replace all of them in every mode.
- **Emission rules.** The resolved per-mode themes SHALL be emitted under the same rules as defaults:
  - a mode whose theme is that mode's built-in contributes no token declarations;
  - one theme for both modes is emitted as an explicit theme is;
  - documents wear the light mode's theme.
- **A missing theme.** A name the caller's registry does not hold SHALL fall back to that mode's default, and the text result SHALL carry a `Theme notes:` line naming the widget, the mode and the missing theme.
- **Groups.** For a `group`, each mode SHALL wear the theme that every item naming a theme for that mode names, when they all name the same one. When items disagree, that mode SHALL wear the default, and the `Theme notes:` line SHALL name each item index with its theme. It SHALL then advise once that the agent can pass `theme` for one look across the group, or render the items as separate widgets when the user wants each widget in its own theme, since one frame wears one theme per mode.
- **Notes never change markup.** They are absent when nothing disagrees or is missing. They ride the text result exactly where hint notes do, and never enter a `page` document, which is browser-facing.
- **Discovery.** `list_widgets` SHALL show `themes` in each descriptor that names them. The `render_widget` `theme` field description SHALL say that a widget naming its own themes wears them, and that `theme` is for when the user asks for another look.

#### Scenario: A widget's themes dress each mode
- **WHEN** widget `promo` names `themes: { light: "acme", dark: "acme-night" }`, the caller's defaults are `brand`/`brand-dark`, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `acme`'s tokens under `:root:not([data-theme="dark"])` and `acme-night`'s under `:root[data-theme="dark"]`, and none of `brand`'s or `brand-dark`'s

#### Scenario: A widget naming one mode keeps the other default
- **WHEN** `promo` names only `light: "acme"` and the dark default is `brand-dark`
- **THEN** the light mode SHALL wear `acme` and the dark mode `brand-dark`

#### Scenario: A built-in name opts out of a brand default
- **WHEN** `promo` names `light: "light"` and the light default is `brand`
- **THEN** the output SHALL carry no light-scoped token declarations

#### Scenario: An explicit theme still wins
- **WHEN** `promo` names `acme` and the render passes `theme: "dark"`
- **THEN** the output SHALL carry the built-in dark theme as an explicit render does, and none of `acme`'s declarations

#### Scenario: Previews, re-renders and pages follow the widget
- **WHEN** `preview_widget` runs for `promo` with no `theme`, an action re-renders `promo`, and `promo` renders with `format: "page"`
- **THEN** the preview's and the re-render's `css` SHALL carry `acme`'s light-scoped declarations as the render's does, and the page SHALL carry `acme`'s tokens under `:root`

#### Scenario: A group whose items agree wears their themes
- **WHEN** a `group` holds two `promo` items and a `card`, and `promo` names `light: "acme"`
- **THEN** the group's light mode SHALL wear `acme`, and the text result SHALL carry no theme note

#### Scenario: A group whose items disagree wears the defaults and says so
- **WHEN** a `group` holds `promo` (light `acme`) and `report` (light `ledger`)
- **THEN** the light mode SHALL wear the light default, and the text result SHALL carry a `Theme notes:` line naming `data.items[0]` with `acme` and `data.items[1]` with `ledger`
- **AND** the line SHALL advise, once, passing `theme` or rendering the items as separate widgets so each wears its own themes
- **AND** a `format: "page"` document SHALL carry no note

#### Scenario: A missing theme falls back with a note
- **WHEN** `promo` names `light: "acme"` and the caller's registry holds no `acme`
- **THEN** the light mode SHALL wear the light default, and the text result SHALL carry a `Theme notes:` line naming `promo`, `light` and `acme`

#### Scenario: Agents see a widget's themes
- **WHEN** `list_widgets` runs for a caller whose widget `promo` names themes
- **THEN** `promo`'s descriptor SHALL carry `themes`, and the `render_widget` input schema's `theme` description SHALL say that a widget's own themes apply without `theme`

# widget-catalog — widget-actions delta

## ADDED Requirements

### Requirement: Group items keep their action identity
When a `group` render composes an item, every action descriptor in that item's rendered subtree SHALL be stamped with `at`: the dotted path of the item's payload within the group payload (`data.items.<i>`). Descriptors keep the `widget` their own template set, so a host can execute an item's binding against the item's kind and fold the result back into the right item. Items without descriptors SHALL render exactly as before, and the `tree`/`html` equivalence of the group render SHALL hold.

#### Scenario: A bound item inside a group is addressable
- **WHEN** a `group` renders a bound `weather` item at position 0 followed by a plain card
- **THEN** the weather element's descriptor SHALL carry `widget: "weather"` and `at: "data.items.0"`, and the card's subtree SHALL carry no descriptor

#### Scenario: Plain items are untouched
- **WHEN** a `group` renders items without any action binding
- **THEN** no subtree SHALL carry a `data-wg-action` attribute and the render SHALL equal a pre-actions group render

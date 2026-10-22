## MODIFIED Requirements

### Requirement: App template size budget
The served app template SHALL stay within explicit size budgets — 45 KiB of UTF-8 bytes raw and 13 KiB gzipped at the highest compression level — pinned by a test in the default gate. Exceeding either budget SHALL fail the gate, and raising one SHALL be a deliberate, reviewed change to the pinned values, never a side effect.

#### Scenario: The template fits its budgets
- **WHEN** the gate runs
- **THEN** `buildAppTemplate()` SHALL measure at most 46,080 bytes raw and at most 13,312 bytes gzipped

#### Scenario: Growth past a budget fails the gate
- **WHEN** a change makes the template exceed either budget
- **THEN** the size test SHALL fail, naming the measured size and the budget

## ADDED Requirements

### Requirement: The frame shows viewer-zone dates in the viewer's zone
Before the app template mounts or patches any render tree (a tool result, a server preview or an action's re-render), it SHALL rewrite the text of every `time` element that carries both `datetime` and `data-wg-date`, formatting that instant by the pattern's tokens (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, on a 24-hour clock) in the viewer's zone. The viewer's zone SHALL be the host context's `timeZone` when it names a zone the frame's `Intl` accepts, and otherwise the frame's own default zone. A `ui/notifications/host-context-changed` that changes the zone SHALL re-render the mounted tree in the new zone. An instant the frame cannot read SHALL keep the renderer's UTC text. Elements without both attributes SHALL be mounted unchanged.

#### Scenario: A viewer-zone date renders in the host's zone
- **WHEN** the host context names `timeZone: "Asia/Tokyo"` and a tool result's tree holds `<time datetime="2026-10-21T16:30:00.000Z" data-wg-date="HH:mm">16:30</time>`
- **THEN** the mounted element's text SHALL be `01:30`

#### Scenario: Without a usable host zone the frame's own zone applies
- **WHEN** the host context names no `timeZone`, or names `"Mars/Base"`
- **THEN** the mounted text SHALL be the instant formatted in the frame's default zone

#### Scenario: A zone change re-renders mounted dates
- **WHEN** a mounted `HH:mm` viewer-zone date shows `01:30` under `Asia/Tokyo` and the host context changes to `America/New_York`
- **THEN** the element's text SHALL become `12:30`

#### Scenario: Server previews localize too
- **WHEN** a server preview's tree holds a viewer-zone `time` element
- **THEN** the preview SHALL show the instant in the viewer's zone, as the tool result will

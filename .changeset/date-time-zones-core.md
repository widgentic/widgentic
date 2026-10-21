---
"@widgentic/core": minor
---

The date format gains an optional `zone`: `{ type: "date", pattern, zone?: "utc" | "value" | "viewer" }`.
- **`utc`** (the default) is unchanged: the instant in UTC.
- **`value`** shows the time the value itself states. `2026-10-21T09:30:00-07:00` with `HH:mm` renders `09:30`; an unzoned value renders as written, and an epoch number in UTC. Every surface agrees.
- **`viewer`** shows the viewer's local time inside MCP Apps frames. On a text bind the renderer emits `<time datetime="<instant, ISO UTC>" data-wg-date="<pattern>">` around the UTC text, which the app template rewrites in the viewer's zone. Every surface without a viewer shows the UTC text. On an attribute value, `viewer` is refused with `INVALID_TEMPLATE_NODE`, since a frame rewrites text only.

New exports: `DATE_ZONES`, `DATE_ZONE_RULE` (the rule text every guide and designer derives from), `isDateZone` and the `DateZone` type.

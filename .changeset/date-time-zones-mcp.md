---
"@widgentic/mcp": minor
---

The app template shows viewer-zone dates in the viewer's zone. Before mounting or patching any tree (a tool result, a server preview or an action's re-render), it rewrites each `time` element the renderer marked with `datetime` and `data-wg-date`, using the host context's `timeZone` when `Intl` accepts it and the frame's own zone otherwise. A `host-context-changed` that changes the zone re-renders in place.

The template's raw size budget rises from 44 KiB to 45 KiB (46,080 bytes); the gzipped budget stays at 13 KiB. The authoring guide's `FORMAT` line derives its zone clause from `DATE_ZONE_RULE`.

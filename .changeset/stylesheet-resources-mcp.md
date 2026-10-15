---
"@widgentic/mcp": minor
---

Stylesheet resources, behind the person's resource domains.
- **The settings section.** A new `resources` section of up to 8 `{ type: "stylesheet", href, integrity? }` entries. Each host must be covered by the same record's `resourceDomains`, so a write that would leave one uncovered, including a domain removal, is refused with `UNDECLARED_DOMAIN`. A malformed entry or another type is refused with `INVALID_RESOURCE`. `PUT /settings` answers both as `422`.
- **Composition.** `composeResources` yields a principal's list. `createWidgenticServer({ resources })` delivers the entries the declared domains cover.
- **Delivery.**
  - Results carry them as `structuredContent.resources`, on renders, previews and action re-renders.
  - The app template links each before the result CSS, keeping a listed link across results and removing the rest.
  - `page` documents link them in their head; the `html` fragment and the payload block never do.
  - `list_themes` lists them for agents.
- **The host bundle** reads them from its settings record and reports an uncovered or refused one through `problems()`.

Without stylesheets every output is byte-identical to before.

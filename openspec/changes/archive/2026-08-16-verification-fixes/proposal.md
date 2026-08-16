# Close the post-archive verification findings

## Why

A cross-spec verification against the just-archived `authoring-guidance`
work found five critical defects and a tail of warnings. Two of them are
live in production (v24), and one is a regression this project introduced
while fixing a different bug — the class of failure that only a
computed-value check catches, because the test that should have caught it
asserted CSS *text* instead.

The findings are not "spec drift" in one direction: some are code failing
its spec, some are specs claiming behavior the code never had, and one is
a documented command that would damage production if run. Each is closed
here at whichever end is wrong.

## What changes

**Critical**

1. **`surface` no longer falls back to `bg`.** The generated `:root`
   defaults block defines `--wg-surface`, so
   `var(--wg-surface, var(--wg-bg, …))` can never reach its fallback. A
   dark theme that sets only `bg` renders white cards and tables —
   verified in Chrome. The defaults block will emit chained values for
   tokens that document a fallback, keeping *both* guarantees ("every
   token is defined" and "surface inherits bg") true at once.
2. **Reserved theme names are accepted, then silently dropped.**
   `checkStoredTheme` has no reserved-name check, so a theme saved as
   `light`/`dark` passes validation, fails `registry.register` during
   compose, and is swallowed into a diagnostic. The store will refuse it
   the way it already refuses reserved widget kinds.
3. **The designer preview can render blank.** The freeze-on-invalid path
   returns before any mount exists, so an invalid *initial* draft leaves
   an empty pane — the exact state the spec forbids.
4. **Theme diagnostics are computed and discarded.** `deriveDiagnostics`
   produces `diagnostics.theme`; nothing renders it.
5. **The README's deploy recipe would damage production.** It omits every
   parameter whose Bicep default mutates live state.

**Warnings**

6. `npm run build` fails (`TS5011`) — the packaging script has been broken
   since a TypeScript upgrade.
7. Read-only mode inerts the Export section, which is not an editing
   surface.
8. The theme designer keeps a single "Import / Export" section, which the
   widget-designer spec says should be two, import first.
9. The authoring guide hand-writes three facts that have live constants.
10. Docs: the README misstates the tool count, `render_widget`'s input,
    the change-event source, the capability count, and documents none of
    the read-only/`widgets` designer surface; TESTING.md is factually
    correct but missing the designer entry, a guide smoke check, the
    current deployed version, and the batch's live findings.

## Impact

- `widget-theming`: the base stylesheet's defaults block gains chained
  values; the fallback guarantee becomes testable by computed value.
- `widget-store`: stored themes reserve the built-in names.
- `widget-designer`: preview never blanks; theme diagnostics surface;
  read-only leaves export operable; the theme designer splits its io
  sections.
- `mcp-server`: the guide derives the last three hand-written facts.
- Docs and the build script carry no spec, but ship in the same change.

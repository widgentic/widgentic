# Design — Test the action's contract, not a widget's fold

## Context

See proposal.md. `applyOutput(definition, output, data, response)` does two
jobs: validate `response` against `definition.output` (the action's schema),
then apply the BINDING's projection and mode (`output.map`, `output.mode`,
default `merge`) into `data`. `testHttpAction` passes `output = undefined`
and `data = {}`, so the default `merge` runs against stand-in data for a
binding nobody wrote. `mode`/`map` live on `ActionBinding.output` — widget
material — which is why the standalone action designer has no control for
them: there is nothing to control at this stage.

## Decisions

**T1 — Pass `{ mode: "replace" }`, not a refactor.** `replace` is exactly
"schema validation + hand back the response": one changed argument in
`testHttpAction`, no signature or core change, and the widget-binding path is
untouched. Alternative — splitting `applyOutput` into validate/fold halves —
is a cleaner shape but touches core's surface for the same behavior; not
worth it for this fix.

**T2 — Kind and Method share a `wgd-row`.** The head renders `[Kind, Method]`
in one row for http (URL keeps its own row); prompt keeps Kind alone. Pure
layout, no spec text governs row composition.

**T3 — Patch changeset for both packages.** Linked group: mcp and designer
co-release on the same number (0.4.1). The apps repo bumps and deploys v71
together with its own key-form CSS fix; the docker example's ranges rewrite
at release.

## Risks / Trade-offs

- [A test passes for an action a merge-mode widget later can't bind] → that
  failure belongs to binding time and still fires there — the widget designer
  is where `mode` is authored and where the author can pick replace/patch;
  the standalone test asserting a fold the author cannot even see was the
  actual defect.

## Context

`.changeset/config.json` declares `"linked": [["@widgentic/core", "@widgentic/designer", "@widgentic/mcp"]]`, `"fixed": []` and `"updateInternalDependencies": "patch"`. Changesets' `linked` aligns the versions of packages released **in the same run** and leaves untouched packages alone; `fixed` publishes every member of the group on every release whether or not it changed. The first release after 0.1.0 carried a designer-only changeset, so the registry now shows `@widgentic/designer@0.2.0` with `@widgentic/core@0.1.0` and `@widgentic/mcp@0.1.0` — and both published dependents declare `@widgentic/core: ^0.1.0`, which the unchanged core satisfies. `widgentic/apps` consumes the three packages as independent ranges and adopted designer 0.2.0 on its own (its v65).

## Goals / Non-Goals

**Goals:** the spec describes what the release pipeline actually does; the compatibility promise is stated where it is actually enforced (dependency ranges); the surprising parts of `linked` are written down before they surprise someone again.
**Non-Goals:** changing the release configuration; re-publishing anything; touching the provenance half of the requirement; renaming the requirement.

## Decisions

1. **Keep `linked`; ratify it in the spec.** `fixed` would make the old sentence true again but publishes unchanged packages: version numbers burned on no-op releases, changelog entries with nothing in them, provenance attestations for artifacts identical to their predecessor, and a catch-up release to pull core and mcp to designer's line. `linked` keeps every published number meaningful ("this package changed"), and the skew it allows is bounded by decision 2.
2. **State the range guarantee instead of the matching-numbers rationale.** Both dependents declare a range on core, and `updateInternalDependencies: "patch"` bumps a dependent when its internal dependency moves, so **core can never ship alone** — a core release fans out to designer and mcp, which `linked` then aligns to one version. Only the leaves can drift ahead of each other, exactly as 0.2.0 did. That is the honest invariant, and it is stronger than asking consumers to match numbers by eye.
3. **Write down the highest-version rule.** When several linked packages are co-released, Changesets gives them all the highest computed version, so a patch-level change can land on a minor number (a future core patch shipping beside a designer minor would take the minor). Undocumented, this reads as a bug the first time it happens; it gets its own scenario.
4. **Write down the manifest-without-release case.** `updateInternalDependencies` rewrites internal ranges wherever they appear, including devDependencies, but only a dependency or peerDependency makes the declaring package release. The 0.2.0 run therefore edited `packages/mcp/package.json` (devDependency `@widgentic/designer` `^0.1.0` → `^0.2.0`) and left mcp at 0.1.0, so the copy on the registry keeps the old devDependency range — harmless, since consumers never install devDeps, but a version-packages diff that touches a manifest reads like a pending release until you know this. Same rationale as decision 3: it is written down before it surprises someone.
5. **Keep the requirement name.** "Versions move together and are attested" stays accurate under the refined body — they do move together whenever they move together — and this repository's archive has no `RENAMED` precedent, so a rename would add delta surface for no clarity gain. The body carries the precision.
6. **Carry every original scenario with its original title.** "A core minor bump moves the group" survives (it is still true, and decision 2 is why); "Provenance is present" is copied verbatim. Only the reason clause of the first is sharpened.

## Risks / Trade-offs

- [Consumers reading three different numbers assume incompatibility] → the docs page already says "install the latest of each"; the requirement now says why that is safe. Cheap to revisit if it ever confuses someone.
- [A future breaking core change] → out of scope here: `linked` still aligns the whole group in that run, because a core release always carries its dependents.

## Migration Plan

Documentation-only: sync the delta into `openspec/specs/package-distribution/spec.md` at archive. Nothing is republished; no consumer action.

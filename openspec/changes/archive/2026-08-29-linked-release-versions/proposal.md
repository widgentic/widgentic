## Why

The `@widgentic/designer@0.2.0` release left `@widgentic/core` and `@widgentic/mcp` at `0.1.0`. That is correct Changesets behavior — the release config declares a `linked` group, not a `fixed` one, so a package with no changeset is not bumped — but `package-distribution`'s "Versions move together and are attested" requires the opposite: "a change that bumps one package's minor or major version SHALL bump the others to the same line". The published registry state violates the spec as written, and CLAUDE.md and the docs have already been corrected to describe the real behavior, so the contract is now the only place still asserting lockstep. This change ratifies the shipped semantics in the spec instead of changing the release config to match a sentence.

Also wrong is the requirement's stated rationale — "so a consumer installing matching versions always gets compatible packages". Matching numbers were never the guarantee: `@widgentic/designer` and `@widgentic/mcp` each declare a dependency range on `@widgentic/core`, and npm resolves a compatible set from those ranges whatever the numbers look like.

## What Changes

- The requirement is rewritten around what `linked` actually promises: packages **released in the same run** take the same version; a package with no change in that run keeps its version, so the three numbers may differ.
- Compatibility is restated as a property of the declared dependency ranges, not of matching version numbers. Because both dependents declare a range on `@widgentic/core`, a core release always releases them too (`updateInternalDependencies: "patch"`), so only the leaf packages can drift ahead.
- Two scenarios are added for behavior the spec never covered and that the 0.2.0 release exposed: a leaf package releasing alone, and co-released packages taking the highest computed version (a patch-level change can therefore land on a minor number).
- The release configuration is deliberately NOT changed: `linked` stays, `fixed` is rejected in design.md with the reasons.
- Not in scope: the provenance and workflow half of the requirement (unchanged, and its scenario is carried over verbatim); package contents, boundaries or entry points; version ranges in `widgentic/apps` (already independent per package).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `package-distribution`: MODIFIES "Versions move together and are attested" — same requirement name and provenance guarantee, precise linked-group semantics, compatibility restated as a range guarantee, two new scenarios.

## Impact

- `openspec/specs/package-distribution/spec.md` only. No code, no configuration, no release.
- Verification that CLAUDE.md ("Release") and `docs/develop/packages.mdx`, already corrected, now agree with the contract rather than contradicting it — plus a sweep of `packages/*/README.md` and the remaining docs pages for stale lockstep wording.

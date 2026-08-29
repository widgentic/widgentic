## 1. Contract

- [x] 1.1 Sync the delta into `openspec/specs/package-distribution/spec.md` (MODIFIED requirement with its four scenarios); `openspec validate --strict linked-release-versions` and `openspec validate --specs` green

## 2. Consistency sweep

- [x] 2.1 Confirm CLAUDE.md's "Release" section and `docs/develop/packages.mdx` (already corrected) match the requirement's wording — linked, not fixed; numbers may differ; ranges carry compatibility
- [x] 2.2 Swept `packages/*/README.md`, `docs/`, `README.md`, `TESTING.md` and CLAUDE.md — no stale lockstep claims remained (`docs/develop/packages.mdx` and CLAUDE.md were corrected when the 0.2.0 release exposed the behavior); CLAUDE.md gained the range guarantee and the manifest-without-release note
- [x] 2.3 Note in `TESTING.md`'s verification log that the 0.2.0 release established the linked behavior and the spec now records it

# Changesets

Every change to a public package ships with a changeset (`npm run changeset`).
core, designer and mcp are a **linked** group: a minor or major bump on one
moves the others to the same version line. `@widgentic/webmcp` (beta) is not
linked — it versions on its own and depends on the others through ranges. `npm run version` applies pending
changesets (versions + CHANGELOGs); the release workflow publishes with npm
provenance. Private workspaces (apps, examples) are never versioned.

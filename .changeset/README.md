# Changesets

Every change to a public package ships with a changeset (`npm run changeset`).
The three public packages are a **linked** group: a minor or major bump on one
moves the others to the same version line. `npm run version` applies pending
changesets (versions + CHANGELOGs); the release workflow publishes with npm
provenance. Private workspaces (apps, examples) are never versioned.

# Self-hosted widgentic — one image, two commands: the MCP endpoint
# (default) and the authoring app (compose overrides the command). The
# @widgentic/* packages install from the npm registry at the ranges in
# package.json, so building this image exercises exactly what a reader
# would install; the two sibling example folders ride along as `file:`
# dependencies. To run against unreleased package changes use `npm link`
# from a built monorepo checkout (see README) — never a committed path.
#
# Build from the repository root (the siblings must be in the context):
#   docker build -f examples/docker/Dockerfile -t widgentic-selfhost examples
FROM node:22-alpine
WORKDIR /srv/docker

# The sibling example folders land where the `file:../` ranges expect them.
COPY shared /srv/shared
COPY mcp-server /srv/mcp-server
COPY docker/package.json ./
# --install-links copies the file: siblings into node_modules (instead of
# symlinking), so their own imports resolve against this install.
RUN npm install --omit=dev --no-audit --no-fund --install-links

COPY docker/ ./

# The install alone cannot prove the example runs — subpath exports resolve
# at import time, not install time — so the build imports what the services
# import. While a needed entry is missing from the PUBLISHED packages (the
# window between landing a change here and releasing it), this fails the
# build instead of shipping containers that crash-loop.
RUN node --disable-warning=ExperimentalWarning ./node_modules/.bin/tsx --eval \
  "Promise.all([import('@widgentic/mcp/authoring'), import('@widgentic/mcp/store/sqlite'), import('@widgentic/mcp/sdk'), import('@widgentic/designer')]).then(() => console.log('entry imports ok'), (error) => { console.error(error); process.exit(1); })"

# node:sqlite is stable in behavior on Node 22 but still flagged
# experimental; the entrypoints silence exactly that warning and no other.
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
ENV WIDGENTIC_DB=/data/widgentic.db

# Unprivileged runtime user (the node image ships one); /data is the volume.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

EXPOSE 8080 8081
CMD ["./node_modules/.bin/tsx", "mcp.ts"]

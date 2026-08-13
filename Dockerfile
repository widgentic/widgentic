# Widgentic MCP server — stateless Streamable HTTP entry.
# tsx runs the TypeScript sources directly (it is a devDependency, so the
# image installs the full dependency set; the library itself has zero
# runtime dependencies).
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY apps ./apps

ENV PORT=3001
EXPOSE 3001

# Unprivileged runtime user (the node image ships one).
USER node

CMD ["npx", "tsx", "apps/mcp-server/http.ts"]

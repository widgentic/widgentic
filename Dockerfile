# Widgentic MCP server — stateless Streamable HTTP entry (the same image runs
# the web app with a different command). The workspace runs on package
# SOURCES through the root tsconfig `paths` (tsx honors them), so no build
# step is needed here; publishing builds `dist` separately.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY examples ./examples
RUN npm ci

ENV PORT=3001
EXPOSE 3001

# Unprivileged runtime user (the node image ships one).
USER node

CMD ["npx", "tsx", "apps/mcp-server/http.ts"]

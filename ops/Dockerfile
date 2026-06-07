# Single image for the whole monorepo (T35). Each compose service runs it with
# a different command. Multi-stage: build with dev deps, then a lean runtime.
FROM node:22-slim AS build
WORKDIR /app
# Prisma needs openssl to generate/run its query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY . .
# postinstall runs `prisma generate` (schema is present from the COPY above).
RUN npm ci
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Built workspaces + node_modules (incl. generated Prisma client).
COPY --from=build /app /app
# Default command; overridden per service in docker-compose.
CMD ["node", "services/api-gateway/dist/index.js"]

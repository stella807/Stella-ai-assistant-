# Build the web app and install production deps, then ship a lean runtime image.
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @safehubby/web build

# Re-resolve with dev dependencies pruned; the API runs TypeScript directly
# under Node's type stripping, so there is no server build step.
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Served by the API, so the session cookie is same-origin.
ENV WEB_ROOT=/app/apps/web/dist
EXPOSE 8787

# Node 22 strips TypeScript types at load; no transpile step in the image.
CMD ["node", "--experimental-strip-types", "apps/api/src/main.ts"]

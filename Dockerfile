# syntax=docker/dockerfile:1.7

# Pinned by digest-friendly minor tag; bump deliberately, not implicitly.
ARG NODE_VERSION=22.22.2

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------- dependencies (cached)
# Only the manifests are copied here, so the (slow) install layer is reused
# across every source-only change.
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# Strip dev dependencies from the tree that ships. --ignore-scripts because the
# `prepare` hook runs husky, which has just been pruned away.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm prune --prod --ignore-scripts

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    # Let the platform's memory limit drive the heap instead of the default.
    NODE_OPTIONS="--max-old-space-size=512"

# dumb-init reaps zombies and forwards SIGTERM so shutdown hooks actually run.
RUN apk add --no-cache dumb-init

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

# Node's own fetch rather than curl: one less package in the runtime image, and
# one less binary an attacker can reach for after an RCE.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

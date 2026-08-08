# syntax=docker/dockerfile:1

# ---- Base: Node LTS (Debian slim) with pnpm via corepack -------------------
# Debian-slim (not Alpine) avoids musl issues with native deps like `sharp`.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---- Deps: install ALL deps (incl. dev) against the frozen lockfile --------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Builder: compile the Next standalone output ---------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NODE_ENV is set at build time so Next produces an optimized production build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- Runner: minimal production image, non-root ----------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Copy the self-contained server. `public` and `.next/static` are NOT included
# in standalone by default (Next 16) — copy them explicitly.
# The `node` user/group already exists in the base image; own the files by it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Amazon's RDS CA bundle — `pg` verifies the managed Postgres certificate
# against it. Public root certificates, safe to ship in the image.
COPY --from=builder --chown=node:node /app/certs ./certs

USER node
EXPOSE 3000

# Secrets and DATABASE_URL are injected at runtime — nothing baked into the image.
CMD ["node", "server.js"]

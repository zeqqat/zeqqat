FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
LABEL org.opencontainers.image.source="https://github.com/zeqqat/zeqqat"
LABEL org.opencontainers.image.licenses="Apache-2.0"
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# instrumentation.ts applies these on startup.
COPY --from=builder --chown=nextjs:nodejs /app/db/migrations ./db/migrations
# The official catalog (bundled specs and kind maps), imported on startup.
COPY --from=builder --chown=nextjs:nodejs /app/catalog ./catalog

USER nextjs
EXPOSE 3000
ENV PORT=3000
# Listen on every interface, so the healthcheck and Traefik both reach it.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

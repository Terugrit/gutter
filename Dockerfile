FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN GUTTER_DB_PATH=:memory: pnpm build
RUN cp -r .next/static .next/standalone/.next/static
RUN cp -r public .next/standalone/public

FROM node:22-alpine AS runner
WORKDIR /app
LABEL org.opencontainers.image.title="Gutter" \
    org.opencontainers.image.description="Self-hosted comic release tracker" \
    org.opencontainers.image.url="https://github.com/terugrit/gutter" \
    org.opencontainers.image.source="https://github.com/terugrit/gutter" \
    io.hass.type="app" \
    io.hass.name="Gutter" \
    io.hass.description="Self-hosted comic release tracker" \
    io.hass.url="https://github.com/terugrit/gutter"
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache libc6-compat && corepack enable
COPY --from=builder /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]

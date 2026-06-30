# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app

# Install OS deps needed for bcryptjs/native compiles (small but safe baseline)
RUN apk add --no-cache tini

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

# Non-root user — create dirs as root first, then hand ownership over
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p uploads/photos uploads/audio \
    && chown -R app:app /app

USER app

COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app . .

EXPOSE 3000

# tini → graceful PID 1, forwards SIGTERM to node properly
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

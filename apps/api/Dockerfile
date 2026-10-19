# LinkPulse API image (Express + redirect engine + click worker), for Render.
# Build from the REPO ROOT (npm workspaces):  docker build -f apps/api/Dockerfile -t linkpulse-api .

FROM node:22-bookworm-slim AS base
# Prisma's engines need OpenSSL; ca-certificates for TLS to Neon and hosted Redis.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false

# ---- build: all API deps (incl. dev) → prisma generate → tsc ----
FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npx tsc -p tsconfig.build.json

# ---- runtime: production deps only + compiled JS ----
FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w apps/api && npm cache clean --force
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && npx prisma generate
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations (non-destructive) on Neon's direct URL, then start. exec → node gets SIGTERM.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]

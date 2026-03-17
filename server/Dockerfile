# Sigil server — agent control surface
# Multi-stage: build TypeScript → copy dist + site to runtime
FROM node:20-slim AS builder
WORKDIR /app

# Native addon build tools (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8090

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy dashboard UI build (if present)
COPY site/ ./site/

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 8090
CMD ["node", "dist/index.js"]

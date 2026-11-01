# Demo Robotky: viacstupňový build -> malý obraz. Databáza (SQLite) a súbory sú na disku
# kontajnera; pri štarte a každú celú hodinu sa nahrajú znova ukážkové dáta.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
# node:sqlite je vstavaný (bez natívnych balíkov); varovanie "experimental" netreba v logoch
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
# /app/data len pre istotu (keby na hostingu niekto nastavil DATA_DIR=./data)
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data /app/data && chown app:app /data /app/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
# 503, kým nie sú nahraté ukážkové dáta
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

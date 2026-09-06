# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# One build for the whole workspace, three images out of it:
#   --target server  -> the Nest code; compose starts it twice, as the
#                       lobby/auth process (main.js) and the game process
#                       (main.game.js)
#   --target client  -> the CRA production build behind nginx on 3002
# Ports and hosts follow docs/ENGINE_INTEGRATION_PLAN.md §9 and the run
# book in docs/CLIENT_PLAYTEST_TODO.md §2.
# ---------------------------------------------------------------------------

# ---- deps: one npm ci for every workspace ---------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --no-audit --no-fund

# ---- build: shared -> server -> client ------------------------------------
FROM deps AS build
COPY tsconfig.json ./
COPY shared shared
COPY server server
COPY client client
COPY scripts/optimize-art.mjs scripts/
RUN npm run build --workspace=shared \
 && npm run build --workspace=server
# A WebP twin next to every PNG, for nginx to hand to browsers that take it
# (docker/nginx.conf). The repo keeps only the PNG masters.
RUN node scripts/optimize-art.mjs
# Where the browser reaches the lobby. Baked in at build time (CRA).
ARG REACT_APP_LOBBY_URL=http://localhost:3000
ENV REACT_APP_LOBBY_URL=$REACT_APP_LOBBY_URL
# Art URLs carry ?v=<this hash> (client/src/assetUrl.ts) so nginx can cache
# them for a year; hashing the masters plus the encoder settings means the
# version moves exactly when the served bytes would.
# CI=false: eslint warnings must not fail the build. No source maps: faster.
RUN export REACT_APP_ASSET_VERSION=$(find client/public scripts/optimize-art.mjs -type f ! -name '*.webp' -print0 \
      | LC_ALL=C sort -z | xargs -0 sha1sum | sha1sum | cut -c1-12) \
 && CI=false GENERATE_SOURCEMAP=false npm run build --workspace=client

# ---- server: lobby/auth or game, picked by the command --------------------
FROM node:24-bookworm-slim AS server
WORKDIR /app
ENV NODE_ENV=development
# NODE_ENV stays off "production": the session cookie is `secure` under
# production (server/src/auth/session-cookie.ts) and this table is plain
# http://localhost.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
CMD ["node", "server/dist/server/src/main.js"]

# ---- client: static build behind nginx ------------------------------------
FROM nginx:1.27-alpine AS client
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/build /usr/share/nginx/html
EXPOSE 3002

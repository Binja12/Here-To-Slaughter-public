# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# One build for the whole workspace, three images out of it:
#   --target server  -> the Nest code; compose starts it twice, as the
#                       lobby/auth process (main.js) and the game process
#                       (main.game.js)
#   --target client  -> the CRA production build behind nginx on 3002
# Ports and hosts follow docs/ENGINE_INTEGRATION_PLAN.md §6.
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
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY tsconfig.json ./
COPY shared shared
COPY server server
COPY client client
COPY scripts/prepare-online-art.mjs scripts/online-art-sizes.mjs scripts/prepare-online-music.mjs scripts/verify-online-assets.mjs scripts/build-asset-catalog.mjs scripts/
RUN npm run build --workspace=shared \
 && npm run build --workspace=server
# The IMAGES are already prepared: client/public/generated/online-art is
# committed, one 720p export per card and the master's own size for the
# backgrounds. Nothing here re-encodes them — that used to be minutes of sharp
# on every build (the owner, 2026-09-08). Run `npm run assets:art` and commit
# what it writes when art changes; `npm run assets:verify` is the gate for
# that, not for this build. Music still needs ffmpeg, so it is still made here.
RUN npm run assets:music
# Where the browser reaches the lobby. Baked in at build time (CRA).
ARG REACT_APP_LOBBY_URL=http://localhost:3000
ENV REACT_APP_LOBBY_URL=$REACT_APP_LOBBY_URL
# The generated catalog supplies per-file versions. This bundle-wide version
# covers any original URL not represented in that catalog.
# CI=false: eslint warnings must not fail the build. No source maps: faster.
RUN export REACT_APP_ASSET_VERSION=$(find client/public -type f ! -path 'client/public/generated/*' ! -name '*.webp' -print0 \
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

# ---- build stage ----
FROM node:22.23.2-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22.23.2-slim AS runtime
WORKDIR /app

# System ffmpeg (glibc) instead of ffmpeg-static's musl binaries, which fail on
# Debian/Ubuntu. node:22-slim is glibc-based, so the packaged ffmpeg works.
#
# `apt-get upgrade` is deliberate: the node:*-slim tags are only rebuilt
# occasionally (e.g. node:22.23.2-slim dates from 2026-08-25), so the Debian
# packages baked into the base layer go stale while the Trivy gate keeps
# learning about the fixes Debian has since published. Installing ffmpeg alone
# never upgrades those shared libraries. Pulling the current security fixes for
# the base layer here keeps the HIGH/CRITICAL scan gate meaningful instead of
# failing on packages the base image shipped weeks ago.
#
# DEBIAN_FRONTEND=noninteractive prevents an upgrade from blocking on a
# conffile/tzdata prompt and hanging the build.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Runtime deps only. ffmpeg-static is a dev-time fallback; the runtime image
# resolves ffmpeg via FFMPEG_PATH above.
# npm is only needed to install deps; the app runs `node dist/server.cjs`
# directly, so drop the npm CLI and its bundled packages (which carry
# HIGH/CRITICAL CVEs) from the runtime image. Node and Corepack are separate
# installs under /usr/local and are untouched.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist

# Non-root user: run as app instead of root so a compromised process can't
# write to the image. Temp uploads/conversions go to os.tmpdir() (/tmp).
RUN useradd --create-home --user-group app \
    && chown -R app:app /app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/ready > /dev/null || exit 1

CMD ["node", "dist/server.cjs"]
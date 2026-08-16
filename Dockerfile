# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app

# System ffmpeg (glibc) instead of ffmpeg-static's musl binaries, which fail on
# Debian/Ubuntu. node:20-slim is glibc-based, so the packaged ffmpeg works.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Runtime deps only. ffmpeg-static is a dev-time fallback; the runtime image
# resolves ffmpeg via FFMPEG_PATH above.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Non-root user: run as app instead of root so a compromised process can't
# write to the image. Temp uploads/conversions go to os.tmpdir() (/tmp).
RUN useradd --create-home --user-group app \
    && chown -R app:app /app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health > /dev/null || exit 1

CMD ["node", "dist/server.cjs"]
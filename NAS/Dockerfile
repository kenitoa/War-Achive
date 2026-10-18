FROM node:22-bookworm-slim AS backend-build
WORKDIR /build/back
COPY back/package.json back/package-lock.json ./
RUN npm ci
COPY back/tsconfig.json back/eslint.config.js back/vitest.config.ts ./
COPY back/src ./src
COPY back/tests ./tests
COPY back/migrations ./migrations
COPY scripts /build/scripts
RUN npm run lint && npm run typecheck && npm run test && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS admin-build
WORKDIR /build/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run lint && npm run typecheck && npm run test && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 ADMIN_PORT=4310 DATA_DIR=/var/lib/war-archive EXPORT_DIR=/var/lib/war-archive-releases
WORKDIR /app/back
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-kor poppler-utils ffmpeg && rm -r /var/lib/apt/lists/*
RUN mkdir -p /var/lib/war-archive /var/lib/war-archive-releases && chown node:node /var/lib/war-archive /var/lib/war-archive-releases
COPY --from=backend-build --chown=node:node /build/back/package.json ./package.json
COPY --from=backend-build --chown=node:node /build/back/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /build/back/dist ./dist
COPY --chown=node:node back/migrations ./migrations
COPY --from=admin-build --chown=node:node /build/admin/dist /app/admin/dist
USER node
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4310/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

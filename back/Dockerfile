FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY admin/package.json admin/package.json
COPY pipeline/package.json pipeline/package.json
RUN npm ci --include-workspace-root

COPY admin admin
COPY pipeline pipeline
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV WAR_ARCHIVE_DATA_ROOT=/data

COPY --from=build /app/pipeline/dist pipeline/dist
COPY --from=build /app/admin/dist admin/dist
COPY admin/server.mjs admin/server.mjs
COPY ["Discord Bot", "Discord Bot"]
COPY pipeline/config pipeline/config
COPY pipeline/sources pipeline/sources
COPY infra/start-backend.sh /usr/local/bin/start-backend
RUN chmod +x /usr/local/bin/start-backend \
  && mkdir -p /data \
  && chown -R node:node /app /data

USER node
VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/start-backend"]

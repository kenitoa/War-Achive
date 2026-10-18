FROM node:22-alpine AS verify
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY test ./test
RUN npm run lint && npm run test

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 API_ORIGIN=http://api:4310 PUBLIC_PATH_PREFIX=/war-archive-api
WORKDIR /app
COPY --from=verify --chown=node:node /app/package.json ./
COPY --from=verify --chown=node:node /app/src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]

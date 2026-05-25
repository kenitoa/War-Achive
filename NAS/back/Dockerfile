FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATA_DIR=/app/data

COPY back/package.json back/package-lock.json ./
RUN npm ci --omit=dev
COPY back/server.js ./server.js
COPY data ./data

EXPOSE 8080

CMD ["node", "server.js"]

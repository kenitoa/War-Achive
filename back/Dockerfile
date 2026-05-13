FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV FRONT_DIR=/app/front

COPY back/package.json back/package-lock.json ./
RUN npm ci --omit=dev
COPY back/server.js ./server.js
COPY front ./front

EXPOSE 8080

CMD ["node", "server.js"]

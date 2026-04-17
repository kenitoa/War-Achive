FROM node:20-alpine

RUN apk --no-cache add dumb-init

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY src/ ./src/

EXPOSE 3000

USER node

CMD ["dumb-init", "node", "src/app.js"]

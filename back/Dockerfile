FROM node:20-alpine

<<<<<<< HEAD
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
=======
RUN apk --no-cache add dumb-init

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY src/ ./src/

EXPOSE 3000

USER node

CMD ["dumb-init", "node", "src/app.js"]
>>>>>>> 9061e3c1c611e3269eb678c6ba6cf7cc2ec959f8

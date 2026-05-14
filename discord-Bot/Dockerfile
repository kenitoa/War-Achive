FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY discord-Bot/package*.json ./
RUN npm install --omit=dev

COPY discord-Bot/bot.js ./bot.js

CMD ["node", "bot.js"]

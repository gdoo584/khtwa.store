FROM node:24-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY server.js index.html ./
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server.js"]

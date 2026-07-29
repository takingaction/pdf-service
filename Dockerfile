FROM node:18-slim

RUN apt-get update && apt-get install -y \
    chromium-browser \
    fonts-liberation \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["node", "src/index.js"]

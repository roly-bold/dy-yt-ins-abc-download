FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && apt-get remove -y python3-pip \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx next build

EXPOSE 3000
CMD ["npm", "start"]

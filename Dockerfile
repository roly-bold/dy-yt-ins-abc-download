FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && apt-get remove -y python3-pip \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies (including dev for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npx next build

# Remove dev dependencies after build
RUN npm prune --omit=dev

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]

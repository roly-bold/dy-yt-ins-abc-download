FROM node:22-slim

# Single RUN layer for all system deps + validation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ca-certificates curl unzip \
    && pip3 install --break-system-packages --no-cache-dir "yt-dlp[default]" \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && yt-dlp --version \
    && deno --version \
    && apt-get remove -y python3-pip curl unzip \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp system-wide config: use deno for YouTube JS runtime
RUN echo '--js-runtimes deno:/usr/local/bin/deno' > /etc/yt-dlp.conf

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

# Self-update yt-dlp on every container start, then start Next.js standalone server
CMD ["sh", "-c", "yt-dlp -U 2>/dev/null; node .next/standalone/server.js"]

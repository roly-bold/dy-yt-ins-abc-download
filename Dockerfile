FROM node:22-slim

# Install Python for yt-dlp, plus deno for YouTube JS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ca-certificates curl unzip \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && curl -fsSL "https://github.com/denoland/deno/releases/download/v2.4.0/deno-x86_64-unknown-linux-gnu.zip" -o /tmp/deno.zip \
    && unzip -q /tmp/deno.zip -d /usr/local/bin \
    && rm /tmp/deno.zip \
    && chmod +x /usr/local/bin/deno \
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
RUN npx next build

EXPOSE 3000
CMD ["npm", "start"]

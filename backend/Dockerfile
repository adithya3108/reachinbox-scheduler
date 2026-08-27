# Backend image for the API and the worker (same image, different CMD
# override per service in docker-compose.prod.yml).
FROM node:20-bookworm-slim

# Prisma's query/schema engines dynamically link against OpenSSL; the slim
# base image doesn't ship it, which fails silently as a schema-engine error
# rather than a clear "missing library" message.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]

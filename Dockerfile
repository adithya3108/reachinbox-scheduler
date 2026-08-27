# Single-container deployment for a free Hugging Face Space (Docker SDK).
#
# Runs Postgres, Redis, the Express API, and the BullMQ worker as sibling
# processes inside one container. This trades production-grade durability
# (no persistent volume on the HF free tier — a Space rebuild/restart wipes
# the in-container Postgres/Redis data) for a genuinely free, single-service
# deployment target. See README.md "Deployment" section for the trade-off
# and the more durable alternative (Neon + Upstash + Render).
FROM node:20-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql redis-server gosu && \
    rm -rf /var/lib/apt/lists/*

ENV PGDATA=/var/lib/postgresql/data \
    DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public" \
    REDIS_URL="redis://localhost:6379" \
    NODE_ENV=production \
    PORT=7860

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7860

ENTRYPOINT ["/entrypoint.sh"]

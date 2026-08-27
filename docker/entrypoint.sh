#!/bin/sh
set -e

PG_VERSION=$(ls /usr/lib/postgresql)
PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"

# --- Postgres: initialize on first boot, then start ---
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Initializing Postgres data directory..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  gosu postgres "$PG_BIN/initdb" -D "$PGDATA" >/dev/null
fi

gosu postgres "$PG_BIN/pg_ctl" -D "$PGDATA" -l /tmp/postgres.log -o "-c listen_addresses='localhost'" start

# Wait for Postgres to accept connections
until gosu postgres "$PG_BIN/pg_isready" -q; do sleep 0.5; done

# Create the app role/database if they don't exist yet
gosu postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='reachinbox'" | grep -q 1 || \
  gosu postgres psql -c "CREATE ROLE reachinbox LOGIN PASSWORD 'reachinbox' SUPERUSER"
gosu postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='reachinbox'" | grep -q 1 || \
  gosu postgres createdb -O reachinbox reachinbox

# --- Redis ---
redis-server --daemonize yes --bind 127.0.0.1

# Wait for Redis
until redis-cli ping >/dev/null 2>&1; do sleep 0.5; done

# --- App: migrate, then run API + worker together ---
cd /app/backend
npx prisma migrate deploy

node dist/server.js &
API_PID=$!
node dist/workers/emailWorker.js &
WORKER_PID=$!

trap 'kill $API_PID $WORKER_PID 2>/dev/null' TERM INT

wait $API_PID $WORKER_PID

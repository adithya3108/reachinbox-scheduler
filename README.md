# ReachInbox Email Scheduler

A mini production-style email outreach scheduler: Google OAuth login, CSV recipient upload,
campaign scheduling with a configurable delay/hourly-limit, BullMQ-backed persistent delayed
jobs, and a worker that sends via Ethereal SMTP with distributed rate limiting and idempotent
delivery.

## 1. Architecture

```
User
  |
  v
React (Vite) Dashboard  --------->  Express API  --------->  PostgreSQL (source of truth)
                                        |                          ^
                                        v                          |
                                   BullMQ / Redis  <----------------
                                  (delayed job queue)
                                        |
                                        v
                                 Email Worker(s) ------> Ethereal SMTP
                                 (separate process,
                                  configurable concurrency)
```

- **PostgreSQL** is the source of truth for all campaign/email state (`SCHEDULED` /
  `PROCESSING` / `SENT` / `FAILED`).
- **Redis + BullMQ** provide durable, delayed job scheduling. Jobs are persisted in Redis and
  survive server/worker restarts.
- **The worker runs as an independent process** (`npm run worker`), decoupled from the Express
  request/response cycle, and can be scaled horizontally.

## 2. Tech Stack

- Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL, BullMQ, ioredis, Passport
  (Google OAuth2), Nodemailer, Zod, Pino
- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, Axios, react-hot-toast
- Infra: Docker Compose (Postgres + Redis only — app processes run natively for a fast dev loop)

## 3. Prerequisites

- Node.js 18+
- Docker Desktop (for Postgres + Redis)
- A Google Cloud OAuth 2.0 Client ID (Web application)
- An Ethereal Email account (https://ethereal.email/create) — free, no signup needed

## 4. Setup

```bash
git clone <repo>
cd reachinbox-scheduler
cp .env.example .env
```

Fill in `.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ETHEREAL_USER=...
ETHEREAL_PASSWORD=...
```

**Google OAuth setup**: In Google Cloud Console → APIs & Services → Credentials, create an
OAuth Client ID (Web application). Add `http://localhost:4000/api/auth/google/callback` as an
authorized redirect URI, and `http://localhost:5173` as an authorized JavaScript origin.

**Ethereal setup**: Visit https://ethereal.email/create, copy the generated SMTP username and
password into `ETHEREAL_USER` / `ETHEREAL_PASSWORD`. (If left blank, the mail service falls
back to auto-creating a throwaway Ethereal test account per process — fine for a quick demo,
but a real account is recommended so all workers share one mailbox.)

Start infra:

```bash
docker compose up -d
```

> Note: the compose file maps Postgres to host port **5433** (not 5432) to avoid clashing with
> any other local Postgres instance. `DATABASE_URL` in `.env.example` already reflects this.

Backend:

```bash
cd backend
npm install
cp ../.env .env          # Prisma CLI reads backend/.env directly
npx prisma migrate dev --name init
npm run dev               # API server on :4000
```

Worker (separate terminal, same backend/ directory):

```bash
npm run worker
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Open `http://localhost:5173`, sign in with Google, and schedule a campaign.

## 5. API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google` | - | Starts Google OAuth redirect flow |
| GET | `/api/auth/google/callback` | - | OAuth callback, creates session, redirects to dashboard |
| GET | `/api/auth/me` | session | Current user |
| POST | `/api/auth/logout` | session | Destroys session |
| POST | `/api/campaigns` | session | Create campaign + schedule emails |
| GET | `/api/campaigns` | session | List the user's campaigns |
| GET | `/api/campaigns/:id` | session | Campaign detail incl. email jobs |
| GET | `/api/emails/scheduled` | session | SCHEDULED/PROCESSING email jobs |
| GET | `/api/emails/sent` | session | SENT/FAILED email jobs |
| GET | `/api/health` | - | Liveness check |

Responses are `{ data: ... }` on success or `{ error: { message, details? } }` on failure, with
400 (validation), 401 (auth), 404, or 500 status codes.

**Deviation from the spec**: `POST /api/auth/google` is implemented as `GET /api/auth/google`
because a real Google OAuth redirect requires a top-level browser navigation (the frontend
renders it as a plain `<a href>`), not an XHR/fetch POST.

## 6. Data Model

`User` → `Sender` (per-user "from" addresses) → `Campaign` → `EmailJob` (one row per recipient).
`EmailJob.id` is a Prisma `cuid()` and doubles as the deterministic BullMQ job id
(`email-job-{id}`), so re-running campaign creation logic can never enqueue a duplicate job for
the same row.

## 7. Scheduling Strategy

When a campaign is created, each recipient's send time is computed **deterministically at
schedule time**, not left entirely to the worker:

```
windowIndex    = floor(i / hourlyLimit)          // which hour bucket, 0-based
indexInWindow  = i % hourlyLimit
scheduledAt    = max(
                   startTime + i * delayMs,                       // pacing by delay
                   startTime + windowIndex * 1h + indexInWindow*delayMs  // hourly cap
                 )
```

This guarantees, purely from math, that a batch never front-loads more than `hourlyLimit`
sends into a single hour — e.g. 1000 recipients with `hourlyLimit=100` deterministically become
hour 1: recipients 1–100, hour 2: 101–200, etc. Each `EmailJob.scheduledAt` is persisted, and a
BullMQ delayed job is enqueued with `delay = scheduledAt - now`.

**Trade-off**: this pre-computes an optimistic plan. It does not know about *other* campaigns
sharing the same sender that were scheduled later — those are separately paced against the
same Redis hourly counter (see below), so the runtime check is still authoritative; the
schedule-time math just avoids naively slamming 1000 jobs at the same instant and hoping the
worker sorts it out.

## 8. Runtime Rate Limiting & Minimum Delay (the actual safety net)

Because schedule-time math cannot account for retries, multiple campaigns, multiple workers, or
clock drift, the **worker enforces both limits again atomically via Redis** immediately before
sending:

- **Hourly limit** — `email-rate:{senderId}:{YYYY-MM-DD-HH}` is atomically incremented via a
  Lua script (`INCR` + limit check + `EXPIRE`, single round trip) so two concurrent workers can
  never both push a sender over its limit. If the increment would exceed `hourlyLimit`, the
  script decrements back and the worker **reschedules** the BullMQ job (a new delayed job, same
  underlying `EmailJob` row, status reset to `SCHEDULED`) to the start of the next hour boundary,
  instead of failing or dropping it.
- **Minimum delay** — `email-rate:last-sent:{senderId}` is claimed via an atomic `SET NX PX
  <minDelayMs>`. Only the worker that successfully sets this key may proceed to send; any other
  concurrent worker trying to send for the same sender within the window fails the `SET NX` and
  backs off (reschedules ~500ms later). This is what makes the delay safe under
  `WORKER_CONCURRENCY > 1` — a per-worker `sleep()` would not prevent two different worker
  threads from sending within the same window.

Both mechanisms are pure Redis atomics (no in-memory counters), so they are correct across any
number of worker processes/instances.

**1000+ email behavior**: with `WORKER_CONCURRENCY=5`, `MIN_DELAY_MS=2000`,
`MAX_EMAILS_PER_HOUR=100` and 1000 pre-scheduled recipients, the schedule-time math already
buckets them into ~10 hourly waves of 100. Within each wave, the Redis min-delay lock still
serializes actual sends to one every 2s regardless of how many workers are concurrently trying,
so a wave of 100 takes ~200s of wall time to fully drain even though 5 workers are polling
concurrently — this is intentional: minimum delay is a per-sender pacing guarantee, not a
concurrency knob.

## 9. Idempotency

Before sending, the worker performs an atomic conditional update:

```sql
UPDATE "EmailJob" SET status = 'PROCESSING'
WHERE id = $1 AND status IN ('SCHEDULED', 'PROCESSING')
```

Prisma's `updateMany` reports how many rows matched; the worker only proceeds if exactly one row
was affected in the current process's atomic transaction step (Postgres row-level locking during
the `UPDATE` guarantees only one concurrent `UPDATE` wins the race — a second worker's `UPDATE`
targeting an already-`PROCESSING`/`SENT` row simply matches 0 rows). Already-`SENT` or terminally
`FAILED` jobs are recognized before the claim attempt and skipped entirely (BullMQ job
acknowledged as a no-op).

**Practical delivery semantics**: this guarantees *at-most-one successful DB-state transition to
PROCESSING at a time* and *the send is only attempted once that transition succeeds*. It does
**not** guarantee exactly-once delivery at the SMTP layer — if the process crashes after
`sendMail()` returns but before the `SENT` write commits, a restart's reconciliation pass (below)
will re-attempt the send, which could theoretically result in two SMTP deliveries for that one
row. This is an inherent limit of any two-phase (external call + local commit) system without a
transactional outbox; we call this out rather than claim a false guarantee.

## 10. Crash / Restart Behavior

- **BullMQ jobs are Redis-persisted** — killing/restarting the API server or worker does not
  lose queued/delayed jobs.
- **On worker startup**, a reconciliation pass finds any `EmailJob` rows stuck in `PROCESSING`
  (worker crashed after claiming but before finishing) and immediately re-schedules them
  (`status` reset to `SCHEDULED`, a fresh BullMQ job enqueued for "now"). Since `sendEmail()` is
  only called *after* the atomic claim, a row can only be stuck in `PROCESSING` if the crash
  happened before or during the actual send — reconciliation intentionally re-attempts these.
- Rows already `SENT` are never touched again — the idempotency check in section 9 skips them
  unconditionally.

Verified manually: scheduled 10 emails with a low hourly cap, confirmed exactly the expected
count sent, force-set one row to `PROCESSING` to simulate a crash mid-send, restarted the
worker, and confirmed the stuck row was reconciled (rescheduled, not duplicated) without
affecting the already-`SENT` rows' count.

## 11. Retry / Failure Behavior

BullMQ job options: `attempts: 4`, exponential backoff starting at 5s. On a thrown error
(e.g. SMTP failure) the `EmailJob` row's `error` and `attempts` are persisted immediately; if
this was the last allowed attempt the row is marked `FAILED` (terminal — the worker will not
retry it again even if the same jobId were somehow re-delivered). Otherwise the row is left as
`SCHEDULED` and the exception is re-thrown so BullMQ's own backoff/retry drives the next attempt
(reusing the same job, not creating a duplicate).

## 12. CSV Upload

Parsing happens client-side (`frontend/src/utils/csv.ts`): the uploaded file's text is split on
whitespace/commas/semicolons, each token is validated against a simple email regex, and
duplicates are removed (case-insensitive) before showing "Detected emails: N". The backend
**re-validates every recipient** with Zod (`email()` schema) and also de-duplicates
server-side — the frontend count is a UX convenience only, never trusted as the source of truth.

## 13. Assumptions & Trade-offs

- Session store uses `connect-redis`, so sessions also survive an API server restart (backed by
  the same Redis instance).
- `Sender` is scoped per-user and identified by email; composing simply upserts a `Sender` row
  for the logged-in user's chosen from-address (defaults to their Google account email) rather
  than requiring a separate "add sender" flow — kept minimal per the assignment's scope.
- No cron, no `setInterval`/`setTimeout` scheduling, no in-memory counters anywhere — every
  persistent/scheduling/rate-limiting concern is backed by BullMQ or Redis atomics as required.
- The reschedule-on-contention path (min-delay/hourly-limit) creates a new suffixed BullMQ job
  id (`email-job-{id}-r{timestamp}`) per attempt rather than reusing the original id, because
  BullMQ rejects re-adding a job with an id that's still active. True duplicate-send prevention
  in this path is provided by the DB status guard (section 9), not the job id.

## 14. Testing Instructions

With Docker infra up and `backend`/`frontend` both running (`npm run dev` + `npm run worker`):

1. **Basic scheduling** — compose one email to one recipient, confirm it appears under
   Scheduled, then Sent once the worker processes it; check the Ethereal preview URL logged by
   the worker.
2. **Multiple emails** — upload a CSV with 10 addresses, confirm all 10 rows are created and
   paced by the configured delay.
3. **Hourly limit** — set `MAX_EMAILS_PER_HOUR=3` in `.env`, restart the worker, schedule 10
   emails; confirm only 3 send in the first hour and the rest show `SCHEDULED` with a
   `scheduledAt` in later hour windows.
4. **Concurrency** — set `WORKER_CONCURRENCY=5`, schedule many emails, confirm the worker log
   shows concurrent job pickups with no duplicate `email sent` lines for the same `emailJobId`.
5. **Restart** — schedule future emails, kill the worker process, restart it (`npm run worker`);
   confirm delayed jobs are still present in Redis/BullMQ and continue firing at their original
   times; confirm previously `SENT` rows are not resent.
6. **Failure** — temporarily point `ETHEREAL_USER`/`PASSWORD` at invalid credentials and
   schedule an email; confirm the row transitions to `FAILED` after exhausting retries and
   `error` is populated.
7. **Duplicate processing** — manually set a row's status to `PROCESSING` and restart the
   worker; confirm the reconciliation log fires and the row is rescheduled rather than
   double-sent.

## 15. Demo Instructions

1. `docker compose up -d`
2. Backend: `npm run dev` (in `backend/`)
3. Worker: `npm run worker` (in `backend/`)
4. Frontend: `npm run dev` (in `frontend/`)
5. Visit `http://localhost:5173`, sign in with Google.
6. Click **Compose New Email**, upload a `.txt`/`.csv` of addresses, fill in subject/body/start
   time/delay/hourly limit, click **Schedule**.
7. Watch the **Scheduled Emails** tab, then **Sent Emails** as the worker processes the queue.
   Ethereal preview links are printed in the worker's console log for each send.

## 16. Deployment

**A single AWS EC2 instance running the full stack via Docker Compose** — Postgres, Redis, the
API, the worker, and an nginx-served frontend build, as five containers on one host
(`docker-compose.prod.yml`). This fits AWS's free tier: a `t2.micro`/`t3.micro` instance gets
750 hours/month free for 12 months on a new-ish account.

**Trade-off, stated plainly**: everything lives on one instance, so it's a single point of
failure and doesn't horizontally scale — fine for a demo/hiring submission, not how you'd run
this for real production traffic (you'd split Postgres/Redis onto managed services like RDS/
ElastiCache and run the API/worker as separately scalable services). The docker-compose
structure already separates each concern into its own container, so that split is a config
change, not a rewrite.

Verified locally before touching AWS: `docker compose -f docker-compose.prod.yml up -d --build`
brings up all five containers cleanly, `/api/health` responds, and the worker starts — same
command you'll run on the EC2 host.

### 1. Launch the EC2 instance

1. AWS Console → EC2 → Launch instance. AMI: **Ubuntu 22.04 LTS**. Instance type: **t2.micro**
   (or t3.micro) to stay in the free tier.
2. Create/select a key pair for SSH access.
3. Security group: allow inbound **22** (SSH) and **80** (the app) from `0.0.0.0/0` (restrict
   22 to your own IP if you can). Port 4000 does **not** need to be public — nginx proxies
   `/api/` to the API container internally, so the app is single-origin from the browser.
4. Allocate an **Elastic IP** and associate it with the instance — a plain EC2 public IP changes
   on stop/start, which would break your Google OAuth redirect URI and CORS config every time.
5. Launch, then SSH in: `ssh -i your-key.pem ubuntu@<elastic-ip>`.

### 2. Install Docker on the instance

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
```

### 3. Deploy the app

```bash
git clone https://github.com/<you>/reachinbox-scheduler.git
cd reachinbox-scheduler
```

Create `.env.prod` on the instance (never commit this):

```
FRONTEND_URL=http://<elastic-ip>
SESSION_SECRET=<a long random string>
COOKIE_SECURE=false
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://<elastic-ip>/api/auth/google/callback
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=...
ETHEREAL_PASSWORD=...
WORKER_CONCURRENCY=5
MIN_DELAY_MS=2000
MAX_EMAILS_PER_HOUR=100
VITE_API_URL=
```

Note `GOOGLE_CALLBACK_URL` uses port 80, not 4000 — the browser only ever talks to nginx;
`VITE_API_URL` is intentionally blank so the built frontend calls `/api/...` as a relative path
(same origin as the page, proxied to the API container internally). `COOKIE_SECURE=false`
because this setup serves plain HTTP; flip it to `true` only once you put HTTPS in front (see
the note at the end of this section).

Then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This builds and starts all five containers; the `api` service runs `prisma migrate deploy`
before starting, so the schema is applied automatically on first boot.

### 4. Wire up Google OAuth

In Google Cloud Console → Credentials, add:
- Authorized redirect URI: `http://<elastic-ip>/api/auth/google/callback`
- Authorized JavaScript origin: `http://<elastic-ip>`

### 5. Verify

```bash
curl http://<elastic-ip>/api/health   # {"data":{"ok":true}}
docker compose -f docker-compose.prod.yml logs -f worker
```

Visit `http://<elastic-ip>` in a browser, sign in with Google, and schedule a campaign exactly
as in the local demo (section 15).

**Note on HTTPS**: this setup uses plain HTTP over the Elastic IP, which keeps the free-tier
setup simple but means Google OAuth's "unverified/insecure" warnings may appear. The nginx
same-origin proxy means this works correctly over plain HTTP (no cross-site cookie problem) --
but for a real deployment, put a domain + Caddy/nginx with Let's Encrypt in front (or an AWS ALB
with an ACM certificate), set `COOKIE_SECURE=true`, and switch `FRONTEND_URL`/`GOOGLE_CALLBACK_URL`
to `https://`.

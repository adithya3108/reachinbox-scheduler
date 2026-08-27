import { Worker, Job } from "bullmq";
import http from "http";
import { redisConnection } from "../config/redis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../db/prisma";
import { sendEmail } from "../services/mailService";
import { tryConsumeHourlySlot, tryAcquireSendSlot } from "../services/rateLimiter";
import { nextHourWindowStart } from "../services/schedulingService";
import { EMAIL_QUEUE_NAME, enqueueEmailJob } from "../queues/emailQueue";

const RESCHEDULE_BACKOFF_MS = 500;

async function processEmailJob(job: Job<{ emailJobId: string }>) {
  const { emailJobId } = job.data;

  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { campaign: true, sender: true },
  });

  if (!emailJob) {
    logger.warn({ emailJobId }, "email job row missing, skipping");
    return;
  }

  // Idempotency: already-sent jobs are acknowledged without resending.
  if (emailJob.status === "SENT") {
    logger.info({ emailJobId }, "job already SENT, skipping (idempotent no-op)");
    return;
  }

  if (emailJob.status === "FAILED") {
    logger.info({ emailJobId }, "job already FAILED terminally, skipping");
    return;
  }

  // Atomic claim: only one worker can transition SCHEDULED -> PROCESSING.
  // Also allow re-claiming stuck PROCESSING rows (crash recovery) since
  // BullMQ guarantees at most one active worker per job at a time.
  const claim = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: { in: ["SCHEDULED", "PROCESSING"] } },
    data: { status: "PROCESSING" },
  });

  if (claim.count !== 1) {
    logger.info({ emailJobId }, "could not claim job (already claimed/sent), skipping");
    return;
  }

  // Distributed minimum-delay enforcement between sends for the same sender.
  const gotSendSlot = await tryAcquireSendSlot(emailJob.senderId);
  if (!gotSendSlot) {
    await rescheduleJob(emailJobId, new Date(Date.now() + RESCHEDULE_BACKOFF_MS));
    return;
  }

  // Distributed hourly rate limit, atomic across all workers.
  const withinHourlyLimit = await tryConsumeHourlySlot(
    emailJob.senderId,
    emailJob.campaign.hourlyLimit
  );
  if (!withinHourlyLimit) {
    const nextWindow = nextHourWindowStart(new Date());
    logger.info({ emailJobId, nextWindow }, "hourly limit reached, rescheduling job");
    await rescheduleJob(emailJobId, nextWindow);
    return;
  }

  try {
    const { messageId, previewUrl } = await sendEmail({
      fromEmail: emailJob.sender.email,
      toEmail: emailJob.recipient,
      subject: emailJob.campaign.subject,
      body: emailJob.campaign.body,
    });

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        messageId,
        error: null,
        attempts: { increment: 1 },
      },
    });

    logger.info({ emailJobId, messageId, previewUrl }, "email sent");
  } catch (err: any) {
    const attempts = emailJob.attempts + 1;
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: isLastAttempt ? "FAILED" : "SCHEDULED",
        error: String(err?.message ?? err),
        attempts,
      },
    });

    logger.error({ emailJobId, err: err?.message, isLastAttempt }, "email send failed");
    throw err; // let BullMQ retry with backoff unless this was the last attempt
  }
}

async function rescheduleJob(emailJobId: string, scheduledAt: Date) {
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: "SCHEDULED", scheduledAt },
  });
  await enqueueEmailJob({ emailJobId, scheduledAt, reschedule: true });
}

/**
 * On startup, find EmailJobs stuck in PROCESSING (worker crashed mid-send)
 * and re-schedule them immediately. This is safe because sendEmail is not
 * called until after the atomic SCHEDULED->PROCESSING claim, so a genuinely
 * completed send would already be SENT, not PROCESSING.
 */
async function reconcileStuckJobs() {
  const stuck = await prisma.emailJob.findMany({
    where: { status: "PROCESSING" },
    select: { id: true },
  });

  for (const { id } of stuck) {
    logger.warn({ emailJobId: id }, "reconciling stuck PROCESSING job from crash");
    await rescheduleJob(id, new Date());
  }

  if (stuck.length > 0) {
    logger.info({ count: stuck.length }, "reconciled stuck jobs on startup");
  }
}

export function startEmailWorker() {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    {
      connection: redisConnection,
      concurrency: env.workerConcurrency,
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "job failed");
  });

  logger.info(
    { concurrency: env.workerConcurrency },
    "email worker started"
  );

  return worker;
}

/**
 * Some free hosts (e.g. Render) only offer a free tier for HTTP "Web
 * Service" deployments, not for background workers. Binding to $PORT with
 * a trivial health-check response lets the worker be deployed as one of
 * those, pinged by an external uptime service to prevent it from sleeping.
 * This is purely for hosting classification -- it has no effect on job
 * processing, and is a no-op locally/on EC2 where PORT isn't set for the
 * worker service.
 */
function startHealthServerIfConfigured() {
  if (!process.env.PORT) return;
  const port = Number(process.env.PORT);
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { ok: true } }));
    })
    .listen(port, () => {
      logger.info({ port }, "worker health server listening");
    });
}

if (require.main === module) {
  startHealthServerIfConfigured();
  reconcileStuckJobs()
    .catch((err) => logger.error({ err }, "reconciliation failed"))
    .finally(() => startEmailWorker());
}

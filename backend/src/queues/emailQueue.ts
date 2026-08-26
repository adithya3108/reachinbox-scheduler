import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-send";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 * 24, count: 5000 },
    removeOnFail: { age: 3600 * 24 * 7 },
  },
});

export function emailJobId(emailJobId: string): string {
  return `email-job-${emailJobId}`;
}

/**
 * Enqueues a BullMQ delayed job for an EmailJob row.
 *
 * The initial enqueue (no `reschedule`) uses a deterministic jobId derived
 * solely from the EmailJob's id, so re-running campaign creation logic (or
 * a retried request) can never create a duplicate BullMQ job for the same
 * row. Internal reschedules (rate-limit deferral) happen while the original
 * BullMQ job instance is still marked active, so they use a suffixed id;
 * true duplicate-send protection for these comes from the DB status guard
 * in the worker (SCHEDULED -> PROCESSING atomic claim), not the jobId.
 */
export async function enqueueEmailJob(params: {
  emailJobId: string;
  scheduledAt: Date;
  reschedule?: boolean;
}): Promise<void> {
  const delay = Math.max(0, params.scheduledAt.getTime() - Date.now());
  const jobId = params.reschedule
    ? `${emailJobId(params.emailJobId)}-r${Date.now()}`
    : emailJobId(params.emailJobId);

  await emailQueue.add(
    "send-email",
    { emailJobId: params.emailJobId },
    { jobId, delay }
  );
}

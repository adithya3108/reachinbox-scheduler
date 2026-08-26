import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import { computeScheduledTimes } from "./schedulingService";
import { enqueueEmailJob } from "../queues/emailQueue";
import type { CreateCampaignInput } from "../types/dto";

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  // De-duplicate recipients, preserving first-seen order.
  const uniqueRecipients = Array.from(new Set(input.recipients.map((r) => r.trim().toLowerCase())));

  const sender = await prisma.sender.upsert({
    where: { userId_email: { userId, email: input.senderEmail } },
    update: {},
    create: { userId, email: input.senderEmail },
  });

  const scheduledTimes = computeScheduledTimes({
    startTime: input.startTime,
    delayMs: input.delayMs,
    hourlyLimit: input.hourlyLimit,
    count: uniqueRecipients.length,
  });

  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        userId,
        senderId: sender.id,
        subject: input.subject,
        body: input.body,
        startTime: input.startTime,
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit,
        status: "SCHEDULED",
      },
    });

    await tx.emailJob.createMany({
      data: uniqueRecipients.map((recipient, i) => ({
        campaignId: c.id,
        senderId: sender.id,
        recipient,
        scheduledAt: scheduledTimes[i],
      })),
    });

    return c;
  });

  const jobs = await prisma.emailJob.findMany({ where: { campaignId: campaign.id } });

  for (const job of jobs) {
    await enqueueEmailJob({ emailJobId: job.id, scheduledAt: job.scheduledAt });
  }

  logger.info(
    { campaignId: campaign.id, recipients: uniqueRecipients.length },
    "campaign created and jobs enqueued"
  );

  return { campaign, jobCount: jobs.length };
}

export async function listCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { sender: true, _count: { select: { emailJobs: true } } },
  });
}

export async function getCampaign(userId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: { emailJobs: true, sender: true },
  });
}

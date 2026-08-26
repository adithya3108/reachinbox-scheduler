import { prisma } from "../db/prisma";

export async function listScheduledEmails(userId: string) {
  return prisma.emailJob.findMany({
    where: {
      status: { in: ["SCHEDULED", "PROCESSING"] },
      campaign: { userId },
    },
    orderBy: { scheduledAt: "asc" },
    include: { campaign: { select: { subject: true } } },
  });
}

export async function listSentEmails(userId: string) {
  return prisma.emailJob.findMany({
    where: {
      status: { in: ["SENT", "FAILED"] },
      campaign: { userId },
    },
    orderBy: { sentAt: "desc" },
    include: { campaign: { select: { subject: true } } },
  });
}

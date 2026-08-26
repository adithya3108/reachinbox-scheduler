import { z } from "zod";

export const createCampaignSchema = z.object({
  senderEmail: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  startTime: z.coerce.date(),
  delayMs: z.number().int().min(0),
  hourlyLimit: z.number().int().min(1),
  recipients: z.array(z.string().email()).min(1).max(20000),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

import { api } from "./api";
import type { Campaign } from "../types";

export interface CreateCampaignPayload {
  senderEmail: string;
  subject: string;
  body: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  recipients: string[];
}

export async function createCampaign(payload: CreateCampaignPayload) {
  const res = await api.post("/campaigns", payload);
  return res.data.data as { campaign: Campaign; jobCount: number };
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await api.get("/campaigns");
  return res.data.data as Campaign[];
}

import { api } from "./api";
import type { EmailJob } from "../types";

export async function fetchScheduledEmails(): Promise<EmailJob[]> {
  const res = await api.get("/emails/scheduled");
  return res.data.data as EmailJob[];
}

export async function fetchSentEmails(): Promise<EmailJob[]> {
  const res = await api.get("/emails/sent");
  return res.data.data as EmailJob[];
}

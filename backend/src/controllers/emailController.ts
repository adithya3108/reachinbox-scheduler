import type { Request, Response, NextFunction } from "express";
import { listScheduledEmails, listSentEmails } from "../services/emailService";

export async function getScheduled(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any).id;
    const data = await listScheduledEmails(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSent(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any).id;
    const data = await listSentEmails(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

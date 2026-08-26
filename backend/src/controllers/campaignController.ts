import type { Request, Response, NextFunction } from "express";
import { createCampaignSchema } from "../types/dto";
import { createCampaign, listCampaigns, getCampaign } from "../services/campaignService";

export async function postCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createCampaignSchema.parse(req.body);
    const userId = (req.user as any).id;
    const result = await createCampaign(userId, input);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any).id;
    const campaigns = await listCampaigns(userId);
    res.json({ data: campaigns });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any).id;
    const campaign = await getCampaign(userId, req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: { message: "Campaign not found" } });
    }
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
}

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { postCampaign, getCampaigns, getCampaignById } from "../controllers/campaignController";

const router = Router();

router.use(requireAuth);
router.post("/", postCampaign);
router.get("/", getCampaigns);
router.get("/:id", getCampaignById);

export default router;

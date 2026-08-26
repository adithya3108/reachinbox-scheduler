import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getScheduled, getSent } from "../controllers/emailController";

const router = Router();

router.use(requireAuth);
router.get("/scheduled", getScheduled);
router.get("/sent", getSent);

export default router;

import { Router } from "express";
import passport from "../config/passport";
import { env } from "../config/env";
import { getMe, logout } from "../controllers/authController";

const router = Router();

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${env.frontendUrl}/login?error=oauth_failed`,
  }),
  (_req, res) => {
    res.redirect(`${env.frontendUrl}/dashboard`);
  }
);

router.get("/me", getMe);
router.post("/logout", logout);

export default router;

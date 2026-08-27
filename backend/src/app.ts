import express from "express";
import cors from "cors";
import session from "express-session";
import RedisStore from "connect-redis";
import pinoHttp from "pino-http";
import passport from "./config/passport";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redisConnection } from "./config/redis";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/authRoutes";
import campaignRoutes from "./routes/campaignRoutes";
import emailRoutes from "./routes/emailRoutes";

export function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Cross-site cookies (frontend and backend on different domains in
  // production, e.g. Vercel + Hugging Face Spaces) require SameSite=None,
  // which browsers only honor when Secure is also set.
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  app.use(
    session({
      store: new RedisStore({ client: redisConnection, prefix: "sess:" }),
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/api/health", (_req, res) => res.json({ data: { ok: true } }));
  app.use("/api/auth", authRoutes);
  app.use("/api/campaigns", campaignRoutes);
  app.use("/api/emails", emailRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

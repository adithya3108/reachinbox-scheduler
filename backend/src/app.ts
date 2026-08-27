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
  // Secure cookies require HTTPS regardless of NODE_ENV -- gated on an
  // explicit COOKIE_SECURE flag (see config/env.ts) rather than assuming
  // "production" means "behind TLS", since e.g. the plain-HTTP EC2 demo
  // deployment is NODE_ENV=production without a certificate in front.
  if (env.cookieSecure) {
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
        secure: env.cookieSecure,
        sameSite: env.cookieSecure ? "none" : "lax",
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

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  // Explicit opt-in, independent of NODE_ENV: only set this once the app is
  // actually served over HTTPS (browsers silently drop cookies marked
  // Secure over plain HTTP, which would otherwise break login).
  cookieSecure: process.env.COOKIE_SECURE === "true",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    "http://localhost:4000/api/auth/google/callback",

  etherealHost: process.env.ETHEREAL_HOST ?? "smtp.ethereal.email",
  etherealPort: Number(process.env.ETHEREAL_PORT ?? 587),
  etherealUser: process.env.ETHEREAL_USER ?? "",
  etherealPassword: process.env.ETHEREAL_PASSWORD ?? "",

  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  minDelayMs: Number(process.env.MIN_DELAY_MS ?? 2000),
  maxEmailsPerHour: Number(process.env.MAX_EMAILS_PER_HOUR ?? 100),
};

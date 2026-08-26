import nodemailer from "nodemailer";
import { env } from "../config/env";

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.etherealUser && env.etherealPassword) {
      return nodemailer.createTransport({
        host: env.etherealHost,
        port: env.etherealPort,
        secure: false,
        auth: { user: env.etherealUser, pass: env.etherealPassword },
      });
    }
    // Fallback: auto-create a throwaway Ethereal test account for local dev
    // when no credentials are configured. Not used if env vars are set.
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

export async function sendEmail(params: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string; previewUrl: string | null }> {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: params.fromEmail,
    to: params.toEmail,
    subject: params.subject,
    text: params.body,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  return { messageId: info.messageId, previewUrl };
}

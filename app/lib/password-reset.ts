import crypto from "crypto";
import nodemailer from "nodemailer";

const PASSWORD_RESET_TTL_MINUTES = 60;

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  return { token, tokenHash, expiresAt };
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildPasswordResetUrl(origin: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || origin;
  return `${baseUrl.replace(/\/$/, "")}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@eventscanner.ai";

  if (!host) {
    return {
      delivered: false,
      previewUrl: process.env.NODE_ENV !== "production" ? params.resetUrl : null,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: params.to,
    subject: "Recupero password EventScanner",
    text: `Hai richiesto il recupero password. Usa questo link entro 60 minuti: ${params.resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>Recupero password</h2>
        <p>Hai richiesto di reimpostare la password del tuo account EventScanner.</p>
        <p>Il link qui sotto resta valido per 60 minuti:</p>
        <p>
          <a href="${params.resetUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;">
            Reimposta password
          </a>
        </p>
        <p>Se non hai richiesto tu questa operazione, puoi ignorare questa email.</p>
        <p style="word-break: break-all; color: #6b7280;">${params.resetUrl}</p>
      </div>
    `,
  });

  return {
    delivered: true,
    previewUrl: null as string | null,
  };
}

import crypto from "crypto";
import { createMailTransport, getMailFrom } from "./mailer";

const EMAIL_VERIFICATION_TTL_MINUTES = 60 * 24; // 24 hours

export function createEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000);

  return { token, tokenHash, expiresAt };
}

export function hashEmailVerificationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildEmailVerificationUrl(origin: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || origin;
  return `${baseUrl.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(params: {
  to: string;
  verifyUrl: string;
}) {
  const transporter = createMailTransport();

  if (!transporter) {
    return {
      delivered: false,
      previewUrl: process.env.NODE_ENV !== "production" ? params.verifyUrl : null,
    };
  }

  await transporter.sendMail({
    from: getMailFrom(),
    to: params.to,
    subject: "Conferma la tua registrazione a EventScanner",
    text: `Grazie per esserti registrato. Conferma il tuo indirizzo email entro 24 ore visitando: ${params.verifyUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2>Conferma la tua email</h2>
        <p>Grazie per esserti registrato su EventScanner.</p>
        <p>Il link qui sotto resta valido per 24 ore:</p>
        <p>
          <a href="${params.verifyUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;">
            Conferma registrazione
          </a>
        </p>
        <p>Se non hai richiesto tu questa registrazione, puoi ignorare questa email.</p>
        <p style="word-break: break-all; color: #6b7280;">${params.verifyUrl}</p>
      </div>
    `,
  });

  return {
    delivered: true,
    previewUrl: null as string | null,
  };
}

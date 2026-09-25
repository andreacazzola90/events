import nodemailer from "nodemailer";

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_USER = "schiodejaneiroevents@gmail.com";
const DEFAULT_FROM = '"EventScanner" <schiodejaneiroevents@gmail.com>';

export function getMailFrom() {
  return process.env.SMTP_FROM || DEFAULT_FROM;
}

// Returns null when no SMTP password is configured so callers can fall back
// to a dev-only preview link instead of failing the request.
export function createMailTransport() {
  const pass = process.env.SMTP_PASS;
  if (!pass) {
    return null;
  }

  const host = process.env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || DEFAULT_SMTP_USER;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

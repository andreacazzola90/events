import { getServerSession } from "next-auth/next";
import { authOptions } from "../../pages/api/auth/[...nextauth]";

export function isAdminUser(user: unknown): boolean {
  const admin = user as { email?: string | null; role?: string; type?: string } | null;
  const email = (admin?.email || "").toLowerCase();
  return (
    admin?.role === "admin" ||
    admin?.type === "admin" ||
    email === "andreacazzola90@gmail.com" ||
    email.startsWith("andreacazzola90@")
  );
}

export async function getAdminSession() {
  const session = (await getServerSession(authOptions as any)) as {
    user?: unknown;
  } | null;
  return session?.user && isAdminUser(session.user)
    ? { user: session.user }
    : null;
}
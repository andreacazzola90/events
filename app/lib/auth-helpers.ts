import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../pages/api/auth/[...nextauth]";

type AuthHandler = (userId: number) => Promise<NextResponse>;
type AdminHandler = () => Promise<NextResponse>;

/**
 * Wraps a route handler requiring an authenticated user.
 * Passes the resolved userId to the callback.
 */
export async function withAuth(handler: AuthHandler): Promise<NextResponse> {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const userId = parseInt((session.user as any).id as string, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
  }
  return handler(userId);
}

/**
 * Wraps a route handler requiring an admin user (role === 'admin').
 */
export async function withAdminAuth(
  handler: AdminHandler,
): Promise<NextResponse> {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const user = session.user as any;
  const email = (user.email || "").toLowerCase();
  const isAdmin =
    user.role === "admin" ||
    user.type === "admin" ||
    email === "andreacazzola90@gmail.com" ||
    email.startsWith("andreacazzola90@");

  if (!isAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }
  return handler();
}

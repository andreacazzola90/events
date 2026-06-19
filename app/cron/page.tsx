import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "../../pages/api/auth/[...nextauth]";
import CronAdminClient from "./CronAdminClient";

function isAdminSessionUser(user: any): boolean {
  const email = (user?.email || "").toLowerCase();
  return (
    user?.role === "admin" ||
    user?.type === "admin" ||
    email === "andreacazzola90@gmail.com" ||
    email.startsWith("andreacazzola90@")
  );
}

export default async function CronPage() {
  const session = (await getServerSession(authOptions as any)) as any;

  if (!session?.user) {
    redirect("/auth");
  }

  if (!isAdminSessionUser(session.user)) {
    redirect("/account");
  }

  return <CronAdminClient />;
}

import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "../../pages/api/auth/[...nextauth]";
import AdminLogClient from "./AdminLogClient";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Log & Cronologia",
  robots: { index: false, follow: false },
};

function isAdmin(user: any): boolean {
  const email = (user?.email || "").toLowerCase();
  return (
    user?.role === "admin" ||
    user?.type === "admin" ||
    email === "andreacazzola90@gmail.com" ||
    email.startsWith("andreacazzola90@")
  );
}

export default async function AdminPage() {
  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user) redirect("/auth");
  if (!isAdmin(session.user)) redirect("/account");

  return (
    <div>
      <div className="border-b border-black/10 bg-white px-4 py-3 md:px-8">
        <Link href="/admin/rassegne" className="text-sm font-bold text-[#a33f24] underline underline-offset-4">
          Gestisci rassegne
        </Link>
      </div>
      <AdminLogClient />
    </div>
  );
}

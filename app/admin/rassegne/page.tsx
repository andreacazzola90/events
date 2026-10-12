import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAdminSession } from "@/lib/admin-auth";
import EventSeriesAdminClient from "./EventSeriesAdminClient";

export const metadata: Metadata = {
  title: "Admin — Rassegne",
  robots: { index: false, follow: false },
};

export default async function AdminEventSeriesPage() {
  const session = await getAdminSession();
  if (!session?.user) redirect("/auth");
  return <EventSeriesAdminClient />;
}
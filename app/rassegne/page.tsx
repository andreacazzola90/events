import Image from "next/image";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { publicPageMetadata } from "../../lib/seo-metadata";
import PageHeading from "../components/PageHeading";

export const metadata: Metadata = publicPageMetadata({
  path: '/rassegne',
  title: "Rassegne ed eventi speciali",
  description: "Programmi completi di festival e rassegne nell'Alto Vicentino.",
});

export const revalidate = 60;

export default async function EventSeriesIndexPage() {
  const [series, adminSession] = await Promise.all([
    prisma.eventSeries.findMany({
      where: { isPublished: true },
      include: {
        _count: { select: { events: { where: { isPublished: true } } } },
        events: {
          where: {
            AND: [
              { isPublished: true },
              {
                OR: [
                  { imageUrl: { not: null } },
                  { media: { some: { kind: "image" } } },
                ],
              },
            ],
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 1,
          select: {
            imageUrl: true,
            media: {
              where: { kind: "image", fileName: "Locandina completa" },
              select: { url: true },
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getAdminSession(),
  ]);

  return (
    <main className="rassegne-page min-h-screen page-shell text-[#1d1d1b]">
      <div className="editorial-container">
        <PageHeading
          kicker="Alto Vicentino"
          title="Rassegne"
          description="Festival e programmi raccolti in un unico calendario."
          action={adminSession?.user ? (
            <Link href="/admin/rassegne" className="inline-flex items-center gap-2 border border-black/20 px-4 py-2.5 text-sm font-bold text-[#1d1d1b] transition-colors hover:border-[#d65a38] hover:text-[#a33f24]">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Gestisci rassegne
            </Link>
          ) : undefined}
        />

        {series.length ? (
          <ul className="rassegne-grid mt-9">
            {series.map((item) => {
              const cover = item.events[0]?.media[0]?.url ?? item.events[0]?.imageUrl ?? null;
              return (
                <li key={item.id}>
                  <Link href={`/rassegne/${item.slug}`} className="series-card group block no-underline hover:no-underline">
                    <div className="series-card-cover">
                      {cover ? (
                        <>
                          <Image src={cover} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="series-card-backdrop" />
                          <Image src={cover} alt={`Locandina di ${item.title}`} fill sizes="(min-width: 1024px) 50vw, 100vw" className="series-card-image" />
                        </>
                      ) : (
                        <div className="series-card-placeholder" aria-hidden="true" />
                      )}
                    </div>
                    <div className="series-card-body">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="text-xl font-black">{item.title}</h2>
                        <span className="series-card-count">{item._count.events} appuntamenti</span>
                      </div>
                      {item.description && <p className="mb-0 mt-2 text-sm leading-6">{item.description}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-9 border-y border-white/10 bg-[#181818] px-4 py-8 text-sm text-white/60">Non ci sono rassegne pubblicate.</p>
        )}
      </div>
    </main>
  );
}
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rassegne ed eventi speciali | EventScanner",
  description: "Programmi completi di festival e rassegne nell'Alto Vicentino.",
};

export const revalidate = 60;

export default async function EventSeriesIndexPage() {
  const series = await prisma.eventSeries.findMany({
    where: { isPublished: true },
    include: { _count: { select: { events: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-[#f5f2ec] px-4 py-10 text-[#1d1d1b] md:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-xs font-bold uppercase text-[#d65a38]">Alto Vicentino</p>
        <h1 className="text-4xl font-black">Rassegne</h1>
        <p className="mt-3 max-w-2xl text-base text-black/60">Festival e programmi raccolti in un unico calendario.</p>

        {series.length ? (
          <ul className="mt-9 divide-y divide-black/10 border-y border-black/10 bg-white">
            {series.map((item) => (
              <li key={item.id}>
                <Link href={`/rassegne/${item.slug}`} className="group block px-4 py-5 transition-colors hover:bg-[#faf5f1] md:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-xl font-black transition-colors group-hover:text-[#a33f24]">{item.title}</h2>
                    <span className="text-xs font-semibold text-black/50">{item._count.events} appuntamenti</span>
                  </div>
                  {item.description && <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">{item.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-9 border-y border-black/10 bg-white px-4 py-8 text-sm text-black/55">Non ci sono rassegne pubblicate.</p>
        )}
      </div>
    </main>
  );
}
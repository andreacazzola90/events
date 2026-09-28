import type { Metadata } from "next";
import packageMetadata from "../../package.json";
import { releaseNotes } from "../../lib/release-notes";
import { TransitionLink } from "../components/TransitionLink";

export const metadata: Metadata = {
  title: "Novità e versioni",
  description: "Cronologia delle novità e degli aggiornamenti di EventScanner.",
};

export default function VersioniPage() {
  return (
    <main className="page-shell">
      <div className="editorial-container">
        <header className="mb-12 max-w-4xl md:mb-16">
          <p className="section-kicker mb-4">EventScanner / Cronologia</p>
          <h1 className="section-title mb-5">Novità e versioni</h1>
          <p className="section-lead mb-6">
            Aggiornamenti del prodotto e miglioramenti visibili, ordinati per
            versione. La versione corrente è <strong className="text-[#1d1d1b]">{packageMetadata.version}</strong>.
          </p>
          <TransitionLink href="/ui-ux" className="industrial-link industrial-link-outline">
            Regole UI/UX <span aria-hidden="true">↗</span>
          </TransitionLink>
        </header>

        <div>
          {releaseNotes.map((release) => (
            <article key={release.version} className="grid gap-5 border-t border-black/15 py-8 md:grid-cols-[minmax(12rem,0.7fr)_1.3fr] md:gap-12 md:py-10">
              <div>
                <p className="section-kicker mb-2">{release.date}</p>
                <h2 className="m-0 text-3xl font-black text-[#1d1d1b]">v{release.version}</h2>
                <p className="mt-2 text-sm text-[#5f5b56]">{release.title}</p>
              </div>
              <div className="space-y-8">
                {release.groups.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[#d65a38]">
                      {group.label}
                    </h3>
                    <ul className="m-0 list-none space-y-3 border-t border-black/10 p-0">
                      {group.items.map((item) => (
                        <li key={item} className="border-b border-black/10 py-3 text-sm leading-relaxed text-[#5f5b56]">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
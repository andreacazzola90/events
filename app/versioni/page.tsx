import type { Metadata } from "next";
import { appBuildInfo } from "../../lib/build-info";
import { releaseNotes } from "../../lib/release-notes";
import { TransitionLink } from "../components/TransitionLink";
import { publicPageMetadata } from "../../lib/seo-metadata";
import PageHeading from "../components/PageHeading";

export const metadata: Metadata = publicPageMetadata({
  path: '/versioni',
  title: "Novità e versioni",
  description: "Cronologia delle novità e degli aggiornamenti di EventScanner.",
});

export default function VersioniPage() {
  return (
    <main className="page-shell">
      <div className="editorial-container">
        <PageHeading
          className="max-w-4xl"
          kicker="EventScanner / Cronologia"
          title="Novità e versioni"
          description={
            <>
            Aggiornamenti del prodotto e miglioramenti visibili, ordinati per
            versione. La versione corrente è <strong className="break-all text-[var(--foreground)]">{appBuildInfo.version}</strong>.
            </>
          }
        />
        <p className="mb-6 text-sm text-[var(--foreground-muted)]">
            {appBuildInfo.builtAt ? (
              <>Build del deploy: <time dateTime={appBuildInfo.builtAt}>{appBuildInfo.builtAtLabel}</time></>
            ) : process.env.NODE_ENV === "development" ? "Sviluppo locale" : "Data build non disponibile"}
        </p>
        <TransitionLink href="/ui-ux" className="industrial-link industrial-link-outline mb-12">
          Design system <span aria-hidden="true">↗</span>
        </TransitionLink>

        <div>
          {releaseNotes.map((release) => (
            <article key={release.version} className="grid gap-5 border-t border-[var(--line)] py-8 md:grid-cols-[minmax(12rem,0.7fr)_1.3fr] md:gap-12 md:py-10">
              <div>
                <p className="section-kicker mb-2">{release.date}</p>
                <h2 className="m-0 text-3xl font-black">v{release.version}</h2>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">{release.title}</p>
              </div>
              <div className="space-y-8">
                {release.groups.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[#d65a38]">
                      {group.label}
                    </h3>
                    <ul className="m-0 list-none space-y-3 border-t border-[var(--line)] p-0">
                      {group.items.map((item) => (
                        <li key={item} className="border-b border-[var(--line)] py-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
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
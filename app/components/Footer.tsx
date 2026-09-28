"use client";
import { TransitionLink } from "./TransitionLink";
import { useSession } from "next-auth/react";

export default function Footer({ version }: { version: string }) {
  const { data: session } = useSession();

  const navLinks = [
    { href: "/eventi", label: "Eventi", icon: "🎵" },
    { href: "/mappa", label: "Mappa", icon: "🗺️" },
    { href: "/crea", label: "Crea", icon: "✨" },
    { href: session ? "/account" : "/auth", label: "Profilo", icon: "👤" },
  ];

  const legalLinks = [
    { href: "#", label: "Privacy Policy" },
    { href: "#", label: "Terms of Service" },
    { href: "#", label: "Cookie Policy" },
    { href: "#", label: "Dati Societari" },
  ];

  const projectLinks = [
    { href: "/ui-ux", label: "Regole UI/UX" },
    { href: "/versioni", label: "Novità e versioni" },
  ];

  return (
    <footer className="site-footer border-t border-black/10 py-12 md:py-16">
      <div className="editorial-container">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-black/10">
          <div>
            <TransitionLink
              href="/"
              className="inline-block no-underline hover:no-underline mb-3"
            >
              <span className="text-2xl font-black uppercase tracking-tight text-black">
                Event<span className="site-brand-accent">/</span>Scanner
              </span>
            </TransitionLink>
            <p className="text-black/60 text-sm leading-relaxed max-w-sm">
              Eventi, luoghi e uscite nell&apos;Alto Vicentino. Aggiornamenti
              quotidiani per capire dove andare e cosa fare.
            </p>
          </div>

          <div>
            <h3 className="text-black font-bold mb-4 uppercase tracking-[0.14em] text-xs">
              Esplora
            </h3>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <TransitionLink
                    href={link.href}
                    className="text-black/65 hover:text-black transition-colors text-sm no-underline hover:no-underline"
                  >
                    {link.label}
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-black font-bold mb-4 uppercase tracking-[0.14em] text-xs">
              Progetto
            </h3>
            <ul className="space-y-2">
              {projectLinks.map((link) => (
                <li key={link.href}>
                  <TransitionLink
                    href={link.href}
                    className="text-black/65 hover:text-black transition-colors text-sm no-underline hover:no-underline"
                  >
                    {link.label}
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-black font-bold mb-4 uppercase tracking-[0.14em] text-xs">
              Link utili
            </h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-black/65 hover:text-black transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-black/55 text-xs uppercase tracking-widest m-0">
            © {new Date().getFullYear()} EventScanner
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a
              href="mailto:hello@eventscanner.ai"
              className="text-black/65 hover:text-black text-sm no-underline hover:no-underline"
            >
              hello@eventscanner.ai
            </a>
            <TransitionLink
              href="/versioni"
              aria-label={`Versione ${version}, novità e cronologia`}
              className="text-black/65 hover:text-black text-xs font-bold uppercase tracking-[0.12em] no-underline hover:no-underline"
            >
              v{version}
            </TransitionLink>
          </div>
        </div>
      </div>
    </footer>
  );
}

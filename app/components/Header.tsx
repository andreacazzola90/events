"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { TransitionLink } from "./TransitionLink";

export default function Header() {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  // Body scroll lock when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileOpen]);

  const navLinks = [
    { href: "/eventi", label: "Eventi" },
    { href: "/mappa", label: "Mappa" },
    { href: "/tutti-gli-eventi", label: "Calendario" },
    { href: session ? "/account" : "/auth", label: "Profilo" },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 border-b border-black/10 backdrop-blur-sm">
        <div className="editorial-container h-16 flex items-center justify-between gap-6">
          <TransitionLink
            href="/"
            className="flex items-baseline gap-2 no-underline hover:no-underline"
          >
            <span className="text-xl font-black tracking-tight text-black uppercase">
              EventScanner
            </span>
          </TransitionLink>

          <nav className="hidden md:flex items-center gap-6" aria-label="Navigazione principale">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <TransitionLink
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`text-[13px] uppercase tracking-[0.12em] font-bold transition-colors no-underline hover:no-underline ${
                    isActive
                      ? "bg-black text-white px-2 py-1"
                      : "text-black/55 hover:text-black"
                  }`}
                >
                  {link.label}
                </TransitionLink>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <TransitionLink
              href="/estensione"
              className="inline-flex items-center gap-2 px-3 py-2 border border-black/20 text-black text-[11px] uppercase tracking-[0.13em] font-bold hover:border-black hover:bg-black hover:text-white transition-colors no-underline hover:no-underline"
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 3V14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M7.5 9.5L12 14L16.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 16.5V18.5C4 19.3284 4.67157 20 5.5 20H18.5C19.3284 20 20 19.3284 20 18.5V16.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Installa app
              <span className="inline-flex items-center rounded-full bg-black text-white px-1.5 py-0.5 text-[9px] tracking-[0.08em] leading-none">
                NUOVO
              </span>
            </TransitionLink>
            <TransitionLink
              href="/crea"
              className="inline-flex items-center px-4 py-2 border border-black text-black text-xs uppercase tracking-[0.14em] font-bold hover:bg-black hover:text-white transition-colors no-underline hover:no-underline"
            >
              Crea evento
            </TransitionLink>
          </div>

          <button
            className="md:hidden inline-flex items-center justify-center w-10 h-10 border border-black/20 text-black"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Chiudi menu" : "Apri menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? "×" : "≡"}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden fixed inset-0 z-100 bg-white pt-16" role="dialog" aria-modal="true" aria-label="Menu di navigazione">
          <div className="editorial-container py-6 border-b border-black/10 flex justify-between items-center">
            <span className="text-sm font-black uppercase tracking-[0.15em]">
              Menu
            </span>
            <button
              className="w-10 h-10 border border-black/20 text-black"
              onClick={() => setMobileOpen(false)}
              aria-label="Chiudi menu"
            >
              ×
            </button>
          </div>

          <nav className="editorial-container py-8 flex flex-col gap-6" aria-label="Navigazione mobile">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <TransitionLink
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`text-2xl font-black uppercase tracking-tight no-underline hover:no-underline ${
                    isActive
                      ? "bg-black text-white px-3 py-2 w-fit"
                      : "text-black/50 hover:text-black"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </TransitionLink>
              );
            })}

            <TransitionLink
              href="/estensione"
              className="mt-2 inline-flex items-center justify-center gap-2 h-11 border border-black/20 text-black text-xs uppercase tracking-[0.14em] font-bold no-underline hover:no-underline"
              onClick={() => setMobileOpen(false)}
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 3V14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M7.5 9.5L12 14L16.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 16.5V18.5C4 19.3284 4.67157 20 5.5 20H18.5C19.3284 20 20 19.3284 20 18.5V16.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Installa estensione/PWA
            </TransitionLink>

            <TransitionLink
              href="/crea"
              className="mt-2 inline-flex items-center justify-center h-12 border border-black bg-black text-white text-sm uppercase tracking-[0.14em] font-bold no-underline hover:no-underline"
              onClick={() => setMobileOpen(false)}
            >
              Crea evento
            </TransitionLink>
          </nav>
        </div>
      )}
    </>
  );
}

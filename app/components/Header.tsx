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
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
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
      <header className="site-header fixed top-0 left-0 right-0 z-50 border-b border-black/10">
        <div className="editorial-container h-16 flex items-center justify-between gap-6">
          <TransitionLink
            href="/"
            className="site-brand flex items-baseline gap-2 no-underline hover:no-underline"
          >
            <span className="text-xl font-black tracking-tight text-black uppercase">
              Event<span className="site-brand-accent">/</span>Scanner
            </span>
          </TransitionLink>

          <nav className="desktop-nav hidden md:flex items-center gap-6" aria-label="Navigazione principale">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <TransitionLink
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`desktop-nav-link site-nav-link text-[11px] uppercase tracking-[0.12em] font-bold transition-colors no-underline hover:no-underline ${
                    isActive
                      ? "site-nav-active text-black"
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
              className="industrial-link industrial-link-primary no-underline hover:no-underline"
            >
              Crea evento <span aria-hidden="true">↗</span>
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

      <div
        id="mobile-menu"
        className={`mobile-menu md:hidden fixed inset-x-0 top-16 bottom-0 z-100 ${mobileOpen ? "mobile-menu-open" : ""}`}
        role="dialog"
        aria-modal={mobileOpen || undefined}
        aria-hidden={!mobileOpen}
        aria-label="Menu di navigazione"
        inert={!mobileOpen}
      >
        <nav className="editorial-container mobile-menu-nav flex flex-col" aria-label="Navigazione mobile">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <TransitionLink
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`mobile-menu-link no-underline hover:no-underline ${
                  isActive
                    ? "mobile-menu-link-active"
                    : "mobile-menu-link-idle"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </TransitionLink>
            );
          })}

            <TransitionLink
              href="/estensione"
              className="mobile-menu-secondary mt-8 inline-flex items-center justify-center gap-2"
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
              className="mobile-menu-primary mt-3 inline-flex items-center justify-center"
              onClick={() => setMobileOpen(false)}
            >
              Crea evento
            </TransitionLink>
        </nav>
      </div>
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Layers3, Menu, Plus, X } from "lucide-react";
import { TransitionLink } from "./TransitionLink";
import { AppIcon } from "./EventIcons";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function Header() {
  const pathname = usePathname() || "";
  const { data: session } = useSession();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      setIsInstalled(
        displayMode.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    };
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    updateInstalled();
    displayMode.addEventListener("change", updateInstalled);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      displayMode.removeEventListener("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileMenuOpen]);

  const navLinks = [
    { href: "/eventi", label: "Eventi", icon: "events" as const },
    { href: "/rassegne", label: "Rassegne", icon: "series" as const },
    { href: "/mappa", label: "Mappa", icon: "map" as const },
    { href: "/crea", label: "Crea", icon: "create" as const, primary: true },
    { href: "/tutti-gli-eventi", label: "Calendario", icon: "calendar" as const },
    { href: session ? "/account" : "/auth", label: "Profilo", icon: "profile" as const },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsMobileMenuOpen(false);
  };

  const renderInstallControl = (inMobileMenu = false) => {
    if (isInstalled) return null;
    const className = "app-install-control";

    if (installPrompt) {
      return (
        <button
          type="button"
          onClick={handleInstall}
          className={className}
          aria-label="Installa EventScanner"
          title="Installa app"
        >
          <AppIcon name="install" className="h-5 w-5" />
          <span>Installa app</span>
        </button>
      );
    }

    return (
      <TransitionLink
        href="/estensione"
        onClick={() => setIsMobileMenuOpen(false)}
        className={`${className} no-underline hover:no-underline`}
        aria-label="Come installare EventScanner"
        title="Installa app"
      >
        <AppIcon name="install" className="h-5 w-5" />
        <span>{inMobileMenu ? "Scarica l’app" : "Installa app"}</span>
      </TransitionLink>
    );
  };

  return (
    <>
      <header className="site-header fixed top-0 left-0 right-0 z-50 border-b border-black/10">
        <div className="editorial-container app-header-inner relative flex h-16 items-center justify-between gap-4">
          <TransitionLink
            href="/"
            className="site-brand flex items-baseline gap-2 no-underline hover:no-underline"
          >
            <span className="text-base font-semibold text-black">
              Event<span className="site-brand-accent">/</span>Scanner
            </span>
          </TransitionLink>

          <nav
            className="desktop-nav hidden items-center gap-6 lg:flex"
            aria-label="Navigazione principale"
          >
            {navLinks.filter((link) => !link.primary).map((link) => {
              const active = isActive(link.href);
              return (
                <TransitionLink
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`desktop-nav-link site-nav-link text-[11px] uppercase tracking-[0.12em] font-bold transition-colors no-underline hover:no-underline ${active ? "site-nav-active text-black" : "text-black/55 hover:text-black"}`}
                >
                  {link.label}
                </TransitionLink>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            {renderInstallControl()}
            <TransitionLink
              href="/crea"
              className="industrial-link industrial-link-primary no-underline hover:no-underline"
            >
              Crea evento <span aria-hidden="true">↗</span>
            </TransitionLink>
          </div>

          <div className="relative flex items-center gap-2 lg:hidden" ref={mobileMenuRef}>
            <TransitionLink
              href="/crea"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-current={isActive("/crea") ? "page" : undefined}
              aria-label="Crea evento"
              title="Crea evento"
              className="inline-flex h-11 w-11 items-center justify-center border border-black/20 bg-white text-[#1d1d1b] no-underline transition-colors hover:bg-[#1d1d1b] hover:text-white hover:no-underline"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </TransitionLink>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-label={isMobileMenuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation-menu"
              className="flex h-11 w-11 items-center justify-center border border-black/15 bg-white text-[#1d1d1b] transition-colors hover:border-[#d65a38] hover:text-[#a33f24]"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {isMobileMenuOpen && (
              <nav
                id="mobile-navigation-menu"
                aria-label="Navigazione mobile"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-1 border border-black/10 bg-white p-2 shadow-xl"
              >
                {navLinks.filter((link) => !link.primary).map((link) => {
                  const active = isActive(link.href);
                  return (
                    <TransitionLink
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-3 px-3 text-sm font-semibold no-underline transition-colors hover:no-underline ${link.primary ? "bg-[#1d1d1b] text-white hover:bg-[#d65a38]" : active ? "bg-[#f5e7e2] text-[#a33f24]" : "text-[#1d1d1b] hover:bg-[#faf5f1]"}`}
                    >
                      {link.icon === "series" ? <Layers3 className="h-5 w-5" aria-hidden="true" /> : <AppIcon name={link.icon} className="h-5 w-5" />}
                      <span>{link.label}</span>
                    </TransitionLink>
                  );
                })}
                {!isInstalled && <div className="mt-1 border-t border-black/10 pt-2">{renderInstallControl(true)}</div>}
              </nav>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

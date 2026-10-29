"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Layers3, Menu, Plus, X } from "lucide-react";
import { TransitionLink } from "./TransitionLink";
import { AppIcon } from "./EventIcons";
import SiteFeedbackWidget from "./SiteFeedbackWidget";

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
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

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

    const dialog = mobileMenuRef.current;
    if (!dialog) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousFocus = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setIsMobileMenuOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      dialog.close();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
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
            className="site-brand absolute left-[50vw] z-10 flex -translate-x-1/2 items-baseline gap-2 no-underline hover:no-underline lg:static lg:translate-x-0"
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
            <SiteFeedbackWidget />
            <TransitionLink
              href="/crea"
              className="industrial-link industrial-link-primary no-underline hover:no-underline"
            >
              Crea evento <span aria-hidden="true">↗</span>
            </TransitionLink>
          </div>

          <div className="mobile-menu-trigger absolute z-30 flex items-center lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-label={isMobileMenuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation-menu"
              aria-haspopup="dialog"
              className="header-icon-control flex h-11 w-11 items-center justify-center border border-black/15 bg-white text-[#1d1d1b] transition-colors"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          <TransitionLink
            href="/crea"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-current={isActive("/crea") ? "page" : undefined}
            aria-label="Crea evento"
            title="Crea evento"
            className="header-icon-control mobile-create-control absolute z-20 inline-flex h-11 w-11 items-center justify-center border border-black/20 bg-white text-[#1d1d1b] no-underline transition-colors hover:no-underline lg:hidden"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </TransitionLink>
        </div>
      </header>
      {isMobileMenuOpen && (
        <dialog
          ref={mobileMenuRef}
          id="mobile-navigation-menu"
          aria-label="Menu di navigazione"
          className="mobile-navigation-dialog"
          onCancel={() => setIsMobileMenuOpen(false)}
          onClose={() => setIsMobileMenuOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setIsMobileMenuOpen(false);
            }
          }}
        >
          <div className="mobile-navigation-toolbar">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Chiudi menu"
              className="header-icon-control flex h-11 w-11 items-center justify-center border border-black/15 bg-white text-[#1d1d1b]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <TransitionLink
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="justify-self-center text-base font-semibold text-black no-underline hover:no-underline"
            >
              Event<span className="site-brand-accent">/</span>Scanner
            </TransitionLink>
            <TransitionLink
              href="/crea"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Crea evento"
              className="header-icon-control flex h-11 w-11 items-center justify-center border border-black/20 bg-white text-[#1d1d1b]"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </TransitionLink>
          </div>
          <nav aria-label="Navigazione mobile" className="mobile-navigation-content">
            {navLinks.filter((link) => !link.primary).map((link) => {
              const active = isActive(link.href);
              return (
                <TransitionLink
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 items-center gap-4 border-b border-black/10 py-4 text-2xl font-bold no-underline hover:no-underline ${active ? "text-[#a33f24]" : "text-[#1d1d1b]"}`}
                >
                  {link.icon === "series" ? <Layers3 className="h-6 w-6" aria-hidden="true" /> : <AppIcon name={link.icon} className="h-6 w-6" />}
                  <span>{link.label}</span>
                </TransitionLink>
              );
            })}
            <div className="mt-6 flex items-center gap-3">
              <SiteFeedbackWidget />
              <span className="text-sm font-semibold text-[#1d1d1b]">Invia una segnalazione</span>
            </div>
            {!isInstalled && <div className="mt-4">{renderInstallControl(true)}</div>}
          </nav>
        </dialog>
      )}
    </>
  );
}

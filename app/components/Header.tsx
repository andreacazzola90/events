"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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

  const navLinks = [
    { href: "/eventi", label: "Eventi", icon: "events" as const },
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
  };

  const renderInstallControl = (mobile = false) => {
    if (isInstalled) return null;
    const className = mobile
      ? "app-install-control app-install-control-mobile"
      : "app-install-control";

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
          {!mobile && <span>Installa app</span>}
        </button>
      );
    }

    return (
      <TransitionLink
        href="/estensione"
        className={`${className} no-underline hover:no-underline`}
        aria-label="Come installare EventScanner"
        title="Installa app"
      >
        <AppIcon name="install" className="h-5 w-5" />
        {!mobile && <span>Installa app</span>}
      </TransitionLink>
    );
  };

  return (
    <>
      <header className="site-header fixed top-0 left-0 right-0 z-50 border-b border-black/10">
        <div className="editorial-container app-header-inner flex h-16 items-center justify-between gap-4">
          <TransitionLink
            href="/"
            className="site-brand flex items-baseline gap-2 no-underline hover:no-underline"
          >
            <span className="text-xl font-black tracking-tight text-black uppercase">
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

          <div className="lg:hidden">{renderInstallControl(true)}</div>
        </div>
      </header>

      <nav className="mobile-tab-bar lg:hidden" aria-label="Navigazione principale">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <TransitionLink
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`mobile-tab ${link.primary ? "mobile-tab-create" : ""} ${active ? "mobile-tab-active" : ""}`}
            >
              <span className="mobile-tab-icon">
                <AppIcon name={link.icon} />
              </span>
              <span className="mobile-tab-label">{link.label}</span>
            </TransitionLink>
          );
        })}
      </nav>
    </>
  );
}

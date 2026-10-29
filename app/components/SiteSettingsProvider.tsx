"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_SITE_PRESENTATION,
  normalizeSitePresentation,
  parseSitePresentationPayload,
  type SitePresentationConfig,
} from "../../lib/site-presentation";

type SiteSettingsContextValue = {
  settings: SitePresentationConfig;
  loaded: boolean;
  saveSettings: (settings: SitePresentationConfig) => Promise<SitePresentationConfig>;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SITE_PRESENTATION);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/site-settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((value) => {
        if (!active || !value) return;
        setSettings(normalizeSitePresentation(value.categories, value.quotes));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => { active = false; };
  }, []);

  const saveSettings = async (nextSettings: SitePresentationConfig) => {
    const payload = parseSitePresentationPayload(nextSettings);
    if (!payload) throw new Error("Controlla colori, icone e citazioni prima di salvare.");

    const response = await fetch("/api/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.error === "string" ? body.error : "Impossibile salvare le impostazioni.");
    }

    const saved = await response.json();
    const normalized = normalizeSitePresentation(saved.categories, saved.quotes);
    setSettings(normalized);
    return normalized;
  };

  return (
    <SiteSettingsContext.Provider value={{ settings, loaded, saveSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  const value = useContext(SiteSettingsContext);
  if (!value) throw new Error("useSiteSettings must be used inside SiteSettingsProvider");
  return value;
}
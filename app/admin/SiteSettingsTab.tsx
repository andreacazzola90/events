"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import EventCategoryIcon from "../components/EventCategoryIcon";
import { useSiteSettings } from "../components/SiteSettingsProvider";
import { CATEGORY_ICON_OPTIONS, type CategoryPresentation, type SiteQuote } from "../../lib/site-presentation";

export default function SiteSettingsTab() {
  const { settings, loaded, saveSettings } = useSiteSettings();
  const [categories, setCategories] = useState<CategoryPresentation[]>(settings.categories);
  const [quotes, setQuotes] = useState<SiteQuote[]>(settings.quotes);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!loaded) return;
    setCategories(settings.categories);
    setQuotes(settings.quotes);
  }, [loaded, settings]);

  const updateCategory = (id: string, field: "icon" | "color", value: string) => {
    setCategories(current => current.map(category => category.id === id ? { ...category, [field]: value } : category));
  };

  const updateQuote = (id: string, field: keyof SiteQuote, value: string | boolean) => {
    setQuotes(current => current.map(quote => quote.id === id ? { ...quote, [field]: value } : quote));
  };

  const addQuote = () => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setQuotes(current => [...current, { id, text: "", author: "", enabled: true }]);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveSettings({ categories, quotes });
      setCategories(saved.categories);
      setQuotes(saved.quotes);
      setFeedback({ kind: "success", text: "Impostazioni salvate." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Impossibile salvare le impostazioni.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-10 text-white">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">Personalizzazione</p>
          <h2 className="mb-2 text-2xl font-black sm:text-3xl">Categorie e citazioni</h2>
          <p className="mb-0 max-w-2xl text-sm text-gray-300">
            Imposta il colore e l’icona usati per ogni categoria e gestisci le frasi mostrate nel sito.
          </p>
        </div>
        <button type="button" onClick={handleSave} disabled={!loaded || saving} className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </header>

      <section aria-labelledby="category-settings-title" className="border-t border-white/10 pt-7">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="category-settings-title" className="mb-0 text-lg font-bold">Categorie</h3>
          <span className="text-xs text-gray-400">Anteprima aggiornata al salvataggio</span>
        </div>
        <div className="divide-y divide-white/10">
          {categories.map(category => (
            <div key={category.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,0.8fr)_minmax(11rem,0.8fr)] sm:items-end">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center border-l-[3px] bg-white/5"
                  style={{ borderInlineStartColor: category.color, backgroundColor: `color-mix(in srgb, ${category.color} 16%, transparent)` }}
                >
                  <EventCategoryIcon category={category.id} iconOverride={category.icon} colorOverride={category.color} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="mb-0.5 truncate text-sm font-bold text-white">{category.label}</p>
                  <code className="text-[11px] text-gray-400">{category.id}</code>
                </div>
              </div>

              <label className="block text-xs font-semibold text-gray-300">
                Icona
                <select
                  value={category.icon}
                  onChange={event => updateCategory(category.id, "icon", event.target.value)}
                  className="mt-1.5 min-h-10 w-full border border-white/15 bg-[#17191f] px-3 text-sm text-white focus:border-white/50 focus:outline-none"
                >
                  {CATEGORY_ICON_OPTIONS.map(icon => (
                    <option key={icon} value={icon}>{icon.replace(/([a-z])([A-Z])/g, "$1 $2")}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-gray-300">
                Colore
                <span className="mt-1.5 flex min-h-10 items-center gap-3 border border-white/15 bg-white/5 px-2.5">
                  <input
                    type="color"
                    value={category.color}
                    onChange={event => updateCategory(category.id, "color", event.target.value)}
                    aria-label={`Colore categoria ${category.label}`}
                    className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
                  />
                  <code className="text-xs uppercase text-gray-200">{category.color}</code>
                </span>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="quote-settings-title" className="border-t border-white/10 pt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="quote-settings-title" className="mb-1 text-lg font-bold">Frasi e attribuzioni</h3>
            <p className="mb-0 text-sm text-gray-400">Le frasi attive vengono mostrate nel footer del sito.</p>
          </div>
          <button type="button" onClick={addQuote} className="inline-flex min-h-10 items-center gap-2 border border-white/20 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
            <Plus className="h-4 w-4" aria-hidden="true" />Aggiungi frase
          </button>
        </div>

        {quotes.length === 0 ? (
          <p className="border-y border-white/10 py-5 text-sm text-gray-400">Nessuna frase configurata.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {quotes.map(quote => (
              <div key={quote.id} className="grid gap-3 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)_auto_auto] lg:items-end">
                <label className="block text-xs font-semibold text-gray-300">
                  Frase
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={quote.text}
                    onChange={event => updateQuote(quote.id, "text", event.target.value)}
                    placeholder="Scrivi la frase"
                    className="mt-1.5 w-full resize-y border border-white/15 bg-[#17191f] px-3 py-2 text-sm font-normal text-white placeholder:text-gray-500 focus:border-white/50 focus:outline-none"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-300">
                  Autore
                  <input
                    maxLength={100}
                    value={quote.author}
                    onChange={event => updateQuote(quote.id, "author", event.target.value)}
                    placeholder="Nome del personaggio"
                    className="mt-1.5 min-h-10 w-full border border-white/15 bg-[#17191f] px-3 text-sm font-normal text-white placeholder:text-gray-500 focus:border-white/50 focus:outline-none"
                  />
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={quote.enabled} onChange={event => updateQuote(quote.id, "enabled", event.target.checked)} />
                  Attiva
                </label>
                <button
                  type="button"
                  onClick={() => setQuotes(current => current.filter(item => item.id !== quote.id))}
                  aria-label="Rimuovi frase"
                  title="Rimuovi frase"
                  className="flex h-10 w-10 items-center justify-center border border-white/15 text-gray-300 transition-colors hover:border-red-300 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {feedback && (
        <p role={feedback.kind === "error" ? "alert" : "status"} className={`mb-0 text-sm ${feedback.kind === "error" ? "text-red-300" : "text-emerald-300"}`}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
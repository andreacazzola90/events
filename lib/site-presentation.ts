import { CATEGORY_MAPPING, STANDARD_CATEGORIES } from "./constants";

export const CATEGORY_ICON_OPTIONS = [
  "Music2",
  "Moon",
  "Landmark",
  "UtensilsCrossed",
  "Trophy",
  "Users",
  "Theater",
  "PartyPopper",
  "Footprints",
  "CalendarDays",
  "BookOpen",
  "Camera",
  "Heart",
  "Palette",
  "Sparkles",
] as const;

export type CategoryIconName = (typeof CATEGORY_ICON_OPTIONS)[number];

export type CategoryPresentation = {
  id: string;
  label: string;
  icon: CategoryIconName;
  color: string;
};

export type SiteQuote = {
  id: string;
  text: string;
  author: string;
  enabled: boolean;
};

export type SitePresentationConfig = {
  categories: CategoryPresentation[];
  quotes: SiteQuote[];
};

const defaultCategoryPresentation: Record<string, Omit<CategoryPresentation, "id">> = {
  musica: { label: "Musica", icon: "Music2", color: "#d65a38" },
  nightlife: { label: "Nightlife", icon: "Moon", color: "#5b5aa6" },
  cultura: { label: "Cultura", icon: "Landmark", color: "#426f9e" },
  cibo: { label: "Cibo", icon: "UtensilsCrossed", color: "#b97818" },
  sport: { label: "Sport", icon: "Trophy", color: "#367857" },
  famiglia: { label: "Famiglia", icon: "Users", color: "#c34d78" },
  teatro: { label: "Teatro", icon: "Theater", color: "#9a3d42" },
  festa: { label: "Festa", icon: "PartyPopper", color: "#c15134" },
  passeggiata: { label: "Passeggiata", icon: "Footprints", color: "#357e7a" },
  altro: { label: "Altro", icon: "CalendarDays", color: "#595959" },
};

export const DEFAULT_CATEGORY_PRESENTATION: CategoryPresentation[] = STANDARD_CATEGORIES.map((id) => ({
  id,
  ...defaultCategoryPresentation[id],
}));

export const DEFAULT_SITE_PRESENTATION: SitePresentationConfig = {
  categories: DEFAULT_CATEGORY_PRESENTATION,
  quotes: [
    {
      id: "dante-inferno-26",
      text: "Fatti non foste a viver come bruti, ma per seguir virtute e canoscenza.",
      author: "Dante Alighieri",
      enabled: true,
    },
    {
      id: "leopardi-linfinito",
      text: "E il naufragar m'è dolce in questo mare.",
      author: "Giacomo Leopardi",
      enabled: true,
    },
  ],
};

const validColor = /^#[0-9a-f]{6}$/i;
const validQuoteId = /^[a-zA-Z0-9_-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeCategoryId(category: string | null | undefined): string {
  const normalized = (category || "").toLowerCase().trim();
  return CATEGORY_MAPPING[normalized] || (STANDARD_CATEGORIES.includes(normalized) ? normalized : "altro");
}

export function getCategoryPresentation(
  category: string | null | undefined,
  settings: CategoryPresentation[] = DEFAULT_CATEGORY_PRESENTATION,
): CategoryPresentation {
  const normalized = normalizeCategoryId(category);
  return settings.find((item) => item.id === normalized)
    ?? settings.find((item) => item.id === "altro")
    ?? DEFAULT_CATEGORY_PRESENTATION[DEFAULT_CATEGORY_PRESENTATION.length - 1];
}

export function normalizeSitePresentation(categories: unknown, quotes: unknown): SitePresentationConfig {
  const categoryRows = Array.isArray(categories) ? categories.filter(isRecord) : [];
  const quoteRows = Array.isArray(quotes) ? quotes.filter(isRecord) : DEFAULT_SITE_PRESENTATION.quotes;

  const normalizedCategories = DEFAULT_CATEGORY_PRESENTATION.map((defaults) => {
    const saved = categoryRows.find((item) => item.id === defaults.id);
    return {
      ...defaults,
      color: typeof saved?.color === "string" && validColor.test(saved.color) ? saved.color.toLowerCase() : defaults.color,
      icon: typeof saved?.icon === "string" && CATEGORY_ICON_OPTIONS.includes(saved.icon as CategoryIconName)
        ? saved.icon as CategoryIconName
        : defaults.icon,
    };
  });

  const normalizedQuotes = quoteRows.flatMap((item) => {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const author = typeof item.author === "string" ? item.author.trim() : "";
    if (!validQuoteId.test(id) || !text || text.length > 500 || !author || author.length > 100) return [];
    return [{ id, text, author, enabled: item.enabled === true }];
  }).slice(0, 100);

  return { categories: normalizedCategories, quotes: normalizedQuotes };
}

export function parseSitePresentationPayload(value: unknown): SitePresentationConfig | null {
  if (!isRecord(value) || !Array.isArray(value.categories) || !Array.isArray(value.quotes)) return null;
  if (value.categories.length !== STANDARD_CATEGORIES.length || value.quotes.length > 100) return null;

  const categoryIds = new Set<string>();
  for (const item of value.categories) {
    if (!isRecord(item) || typeof item.id !== "string" || categoryIds.has(item.id)) return null;
    if (!STANDARD_CATEGORIES.includes(item.id) || typeof item.color !== "string" || !validColor.test(item.color)) return null;
    if (typeof item.icon !== "string" || !CATEGORY_ICON_OPTIONS.includes(item.icon as CategoryIconName)) return null;
    categoryIds.add(item.id);
  }
  if (STANDARD_CATEGORIES.some((id) => !categoryIds.has(id))) return null;

  const quoteIds = new Set<string>();
  for (const item of value.quotes) {
    if (!isRecord(item) || typeof item.id !== "string" || !validQuoteId.test(item.id) || quoteIds.has(item.id)) return null;
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > 500) return null;
    if (typeof item.author !== "string" || !item.author.trim() || item.author.length > 100) return null;
    if (typeof item.enabled !== "boolean") return null;
    quoteIds.add(item.id);
  }

  return normalizeSitePresentation(value.categories, value.quotes);
}
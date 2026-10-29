"use client";

import { usePathname } from "next/navigation";
import { useSiteSettings } from "./SiteSettingsProvider";

function hashPath(path: string): number {
  let hash = 0;
  for (const character of path) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

export default function SiteQuote() {
  const pathname = usePathname() || "/";
  const { settings } = useSiteSettings();
  const quotes = settings.quotes.filter((quote) => quote.enabled);
  if (!quotes.length) return null;

  const quote = quotes[hashPath(pathname) % quotes.length];

  return (
    <figure className="site-quote my-8 max-w-3xl border-l-2 border-[#d65a38] py-2 pl-5">
      <blockquote className="mb-2 text-sm italic leading-relaxed text-black/75 sm:text-base">
        “{quote.text}”
      </blockquote>
      <figcaption className="section-kicker text-black/50">{quote.author}</figcaption>
    </figure>
  );
}
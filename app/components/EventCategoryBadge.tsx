"use client";

import { getCategoryPresentation, normalizeCategoryId } from "../../lib/site-presentation";
import EventCategoryIcon from "./EventCategoryIcon";
import { useSiteSettings } from "./SiteSettingsProvider";

export default function EventCategoryBadge({
  category,
  className = "",
  iconClassName = "h-3.5 w-3.5",
}: {
  category: string;
  className?: string;
  iconClassName?: string;
}) {
  const { settings } = useSiteSettings();
  const presentation = getCategoryPresentation(category, settings.categories);
  const tint = `color-mix(in srgb, ${presentation.color} 13%, white)`;

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 border-l-[3px] px-3 py-1 text-xs font-bold uppercase ${className}`}
      data-category={presentation.id}
      style={{ borderInlineStartColor: presentation.color, backgroundColor: tint }}
    >
      <EventCategoryIcon category={category} className={iconClassName} />
      <span>{normalizeCategoryId(category) === presentation.id ? presentation.label : category}</span>
    </span>
  );
}
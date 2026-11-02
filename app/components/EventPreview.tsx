"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { getEventStartTime } from "../../lib/event-display";
import { CalendarIcon, MapPinIcon } from "./EventIcons";
import EventCategoryBadge from "./EventCategoryBadge";
import FavoriteButton from "./FavoriteButton";
import { TransitionLink } from "./TransitionLink";

type PriceLabel = "gratis" | "pagamento";

export interface EventPreviewProps {
  eventId: number;
  href: string;
  title: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  description?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  organizer?: string | null;
  category?: string | null;
  price?: string | null;
  originLabel?: string;
  editHref?: string;
  initialIsFavorite?: boolean;
  onFavoriteToggle?: (newValue: boolean) => void;
  showFavorite?: boolean;
  imageLoading?: "eager" | "lazy";
  imageSizes?: string;
}

function getPriceLabel(rawPrice?: string | null): PriceLabel | null {
  const price = (rawPrice ?? "").trim().toLowerCase();
  if (!price || /^(undefined|null|non definito|non specificato|non trovato|not defined|not specified|not found)$/i.test(price)) return null;
  if (price.includes("gratis") || price.includes("ingresso libero") || price.includes("ingresso gratuito") || price.includes("free")) return "gratis";
  if (/\d/.test(price) || price.includes("€") || price.includes("euro") || price.includes("bigliett") || price.includes("prevendita") || price.includes("ticket") || price.includes("vivaticket") || price.includes("ticketone")) return "pagamento";
  return null;
}

function getPriceBadgeClasses(label: PriceLabel): string {
  return label === "gratis" ? "bg-black text-white" : "bg-black/80 text-white";
}

function formatDateLabel(value?: string | null): string | null {
  const rawValue = value?.trim();
  if (!rawValue) return null;

  let date: Date;
  if (rawValue.includes("/")) {
    const [day, month, year] = rawValue.split("/").map((part) => parseInt(part, 10));
    if (!day || !month || !year) return rawValue;
    date = new Date(year, month - 1, day);
  } else {
    date = /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ? new Date(`${rawValue}T00:00:00`)
      : new Date(rawValue);
  }

  if (Number.isNaN(date.getTime())) return rawValue;
  return date.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function EventPreview({
  eventId,
  href,
  title,
  imageUrl,
  imageUrls,
  description,
  date,
  time,
  location,
  organizer,
  category,
  price,
  originLabel,
  editHref,
  initialIsFavorite,
  onFavoriteToggle,
  showFavorite = true,
  imageLoading = "lazy",
  imageSizes = "(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 50vw",
}: EventPreviewProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const previewImages = [...new Set([imageUrl, ...(imageUrls ?? [])].filter((url): url is string => Boolean(url)))].slice(0, 5);
  const activeImage = previewImages[activeImageIndex] ?? previewImages[0] ?? null;
  const priceLabel = getPriceLabel(price);
  const dateLabel = formatDateLabel(date);
  const timeLabel = getEventStartTime(time);

  const changeImage = (direction: -1 | 1) => {
    if (previewImages.length < 2) return;
    setActiveImageIndex((current) => (current + direction + previewImages.length) % previewImages.length);
  };

  return (
    <article className="event-card group">
      <div className="event-card-media relative overflow-hidden">
        {activeImage ? (
          <div className="event-card-image-backdrop" aria-hidden="true">
            <Image
              key={`backdrop-${activeImage}`}
              src={activeImage}
              alt=""
              fill
              sizes={imageSizes}
              className="event-card-backdrop-image"
            />
          </div>
        ) : null}
        <TransitionLink
          href={href}
          aria-label={title}
          className="event-card-image-link"
        >
          {activeImage ? (
            <Image
              key={activeImage}
              src={activeImage}
              alt={title}
              fill
              sizes={imageSizes}
              className="event-card-image"
              loading={imageLoading}
            />
          ) : (
            <div className="event-card-placeholder flex h-full w-full items-center justify-center">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-white/55">No image</span>
            </div>
          )}
        </TransitionLink>
        {showFavorite && (
          <FavoriteButton
            eventId={eventId}
            initialIsFavorite={initialIsFavorite}
            onToggle={onFavoriteToggle}
          />
        )}
        {originLabel && <span className="event-card-origin-label">{originLabel}</span>}
        {previewImages.length > 1 && (
          <>
            <div className="event-card-slide-controls">
              <button
                type="button"
                aria-label="Immagine precedente"
                onClick={() => changeImage(-1)}
                className="event-card-slide-button"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Immagine successiva"
                onClick={() => changeImage(1)}
                className="event-card-slide-button"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <span className="event-card-slide-count" aria-live="polite">
              {activeImageIndex + 1} / {previewImages.length}
            </span>
          </>
        )}
      </div>

      <TransitionLink href={href} className="event-card-body flex min-w-0 flex-col no-underline hover:no-underline">
        <div className="event-card-badges flex items-center justify-between gap-2">
          {category && (
            <EventCategoryBadge
              category={category}
              variant="dark"
              className="max-w-[75%] break-words px-1.5 py-1 text-[9px] sm:px-2.5 sm:text-[10px]"
              iconClassName="h-3 w-3 shrink-0"
            />
          )}
          {priceLabel && (
            <span className={`ml-auto shrink-0 px-1.5 py-1 text-[9px] font-bold uppercase sm:px-2 sm:text-[10px] ${getPriceBadgeClasses(priceLabel)}`}>
              {priceLabel}
            </span>
          )}
        </div>
        <h3 className="event-card-title text-lg font-black leading-tight line-clamp-2 md:text-xl">
          {title}
        </h3>
        {description && <p className="event-card-description line-clamp-2 text-sm">{description}</p>}
        <div className="space-y-1 text-sm">
          {(dateLabel || timeLabel) && (
            <div className="flex items-center gap-2 text-white/85">
              <CalendarIcon className="event-card-meta-icon h-4 w-4 shrink-0 text-[#d65a38]" />
              {dateLabel && <span>{dateLabel}</span>}
              {timeLabel && <span className="text-white/60">• {timeLabel}</span>}
            </div>
          )}
          {location && (
            <div className="flex min-w-0 items-center gap-2 text-white/85">
              <MapPinIcon className="event-card-meta-icon h-4 w-4 shrink-0 text-[#d65a38]" />
              <span className="truncate">{location}</span>
            </div>
          )}
          {organizer && (
            <div className="event-card-organizer flex min-w-0 items-center gap-2 text-white/75">
              <span className="w-4 shrink-0 text-center">•</span>
              <span className="truncate">{organizer}</span>
            </div>
          )}
        </div>
      </TransitionLink>
      {editHref && (
        <div className="event-card-actions">
          <TransitionLink href={editHref} className="event-card-action no-underline hover:no-underline">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span>Modifica evento</span>
          </TransitionLink>
        </div>
      )}
    </article>
  );
}

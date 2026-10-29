import {
  CalendarDays,
  BookOpen,
  Camera,
  Footprints,
  Heart,
  Landmark,
  Moon,
  Music2,
  PartyPopper,
  Palette,
  Sparkles,
  Theater,
  Trophy,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { getCategoryPresentation, type CategoryIconName } from "../../lib/site-presentation";
import { useSiteSettings } from "./SiteSettingsProvider";

const categoryIcons: Record<CategoryIconName, LucideIcon> = {
  BookOpen,
  Camera,
  CalendarDays,
  Footprints,
  Heart,
  Landmark,
  Moon,
  Music2,
  Palette,
  PartyPopper,
  Sparkles,
  Theater,
  Trophy,
  UtensilsCrossed,
  Users,
};

export default function EventCategoryIcon({
  category,
  className = "h-4 w-4",
  iconOverride,
  colorOverride,
}: {
  category: string;
  className?: string;
  iconOverride?: CategoryIconName;
  colorOverride?: string;
}) {
  const { settings } = useSiteSettings();
  const presentation = getCategoryPresentation(category, settings.categories);
  const Icon = categoryIcons[iconOverride || presentation.icon] || CalendarDays;
  return <Icon className={className} style={{ color: colorOverride || presentation.color }} aria-hidden="true" />;
}

import {
  CalendarDays,
  Footprints,
  Landmark,
  Moon,
  Music2,
  PartyPopper,
  Theater,
  Trophy,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { normalizeCategory } from "../../lib/event-utils";

const categoryIcons: Record<string, LucideIcon> = {
  musica: Music2,
  nightlife: Moon,
  cultura: Landmark,
  cibo: UtensilsCrossed,
  sport: Trophy,
  famiglia: Users,
  teatro: Theater,
  festa: PartyPopper,
  passeggiata: Footprints,
  altro: CalendarDays,
};

export default function EventCategoryIcon({
  category,
  className = "h-4 w-4",
}: {
  category: string;
  className?: string;
}) {
  const Icon = categoryIcons[normalizeCategory(category)] || CalendarDays;
  return <Icon className={className} aria-hidden="true" />;
}

import { revalidatePath, revalidateTag } from "next/cache";

export const PUBLIC_EVENTS_TAG = "events-list";

export function invalidatePublicEvents({ slug, seriesSlug }: { slug?: string; seriesSlug?: string } = {}): boolean {
  try {
    revalidateTag(PUBLIC_EVENTS_TAG, { expire: 0 });
    for (const path of ["/", "/eventi", "/tutti-gli-eventi", "/mappa", "/rassegne", "/sitemap.xml"]) {
      revalidatePath(path);
    }
    if (slug) revalidatePath(`/events/${slug}`);
    revalidatePath(seriesSlug ? `/rassegne/${seriesSlug}` : "/rassegne/[slug]", "page");
    return true;
  } catch (error) {
    console.warn("[public-event-cache] Impossibile rigenerare le viste pubbliche", error);
    return false;
  }
}

import { closeBrowser, getBrowser } from "./browser-vercel";

type DiscoveryResult = {
  listUrl?: string;
  eventLinkSelector?: string;
  nextPageSelector?: string | null;
  includePattern?: string | null;
  excludePattern?: string | null;
  notes?: string;
  confidence: number;
  listingSelector?: string | null;
  sampleEventUrl?: string | null;
};

type PageAnalysis = DiscoveryResult & {
  scannedUrl: string;
  candidateCount: number;
};

const EVENT_KEYWORDS = [
  "event",
  "eventi",
  "evento",
  "agenda",
  "calendario",
  "manifestazioni",
  "cosa-fare",
  "whats-on",
  "whatson",
  "things-to-do",
];

const NEXT_KEYWORDS = [
  "next",
  "avanti",
  "prossima",
  "successiva",
  "older",
  "more",
  "piu",
  "più",
  "›",
  "»",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLikelyEventUrl(url: string): boolean {
  const lowered = url.toLowerCase();
  if (!/^https?:\/\//.test(lowered)) return false;

  const blacklist = [
    "/login",
    "/signin",
    "/register",
    "/privacy",
    "/cookie",
    "/contact",
    "/contatti",
    "/about",
    "/chi-siamo",
    "/tag/",
    "/author/",
    "/categoria/",
    "/category/",
    "/feed",
    "wp-json",
  ];

  if (blacklist.some((piece) => lowered.includes(piece))) {
    return false;
  }

  return EVENT_KEYWORDS.some((kw) => lowered.includes(kw));
}

function pickBest(analyses: PageAnalysis[]): PageAnalysis | null {
  if (analyses.length === 0) return null;

  return analyses
    .slice()
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.candidateCount - a.candidateCount;
    })[0];
}

export async function discoverCronSourceConfig(seedUrl: string): Promise<DiscoveryResult | null> {
  let browser: any = null;

  try {
    browser = await getBrowser({
      headless: true,
      timeout: 45000,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    const candidateUrls = new Set<string>([seedUrl]);

    const openAndAnalyze = async (url: string): Promise<PageAnalysis | null> => {
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const analysis = (await page.evaluate(
          ({
            eventKeywords,
            nextKeywords,
          }: {
            eventKeywords: string[];
            nextKeywords: string[];
          }) => {
            const toAbs = (href: string) => {
              try {
                return new URL(href, window.location.href).toString();
              } catch {
                return "";
              }
            };

            const eventWords = eventKeywords.map((k: string) => k.toLowerCase());
            const nextWords = nextKeywords.map((k: string) => k.toLowerCase());

            const allAnchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];

            const navCandidateUrls = allAnchors
              .map((a) => {
                const href = toAbs(a.getAttribute("href") || "");
                const text = (a.textContent || "").trim().toLowerCase();
                return { href, text };
              })
              .filter((item) => {
                if (!item.href || !item.href.startsWith("http")) return false;
                return eventWords.some((kw: string) => item.href.toLowerCase().includes(kw) || item.text.includes(kw));
              })
              .slice(0, 8)
              .map((x) => x.href);

            const candidates = allAnchors
              .map((a) => {
                const hrefRaw = a.getAttribute("href") || "";
                const href = toAbs(hrefRaw);
                const text = (a.textContent || "").trim();
                const loweredHref = href.toLowerCase();
                const loweredText = text.toLowerCase();

                if (!href || !href.startsWith("http")) return null;
                if (href.startsWith("mailto:") || href.startsWith("tel:")) return null;

                let score = 0;
                if (eventWords.some((kw: string) => loweredHref.includes(kw) || loweredText.includes(kw))) score += 3;
                if (/\/(20\d{2}|\d{4})\//.test(loweredHref) || /\d{2}[-/]\d{2}/.test(loweredHref)) score += 1;
                if (loweredHref.includes("/tag/") || loweredHref.includes("/author/") || loweredHref.includes("/category/")) score -= 3;
                if (loweredHref.includes("/login") || loweredHref.includes("/privacy") || loweredHref.includes("/cookie")) score -= 2;

                if (score <= 0) return null;

                const classList = Array.from(a.classList || []).filter(Boolean);

                let listingClass: string | null = null;
                let parent = a.parentElement;
                let hops = 0;
                while (parent && hops < 5) {
                  if (parent.classList.length > 0) {
                    listingClass = Array.from(parent.classList)[0] || null;
                    if (listingClass) break;
                  }
                  parent = parent.parentElement;
                  hops += 1;
                }

                return {
                  href,
                  text,
                  classList,
                  listingClass,
                };
              })
              .filter(Boolean) as Array<{
              href: string;
              text: string;
              classList: string[];
              listingClass: string | null;
            }>;

            const uniqueLinks = Array.from(new Set(candidates.map((c) => c.href)));

            const classFreq = new Map<string, number>();
            candidates.forEach((c) => {
              c.classList.forEach((cls) => classFreq.set(cls, (classFreq.get(cls) || 0) + 1));
            });
            const sharedClass = Array.from(classFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

            const listingClassFreq = new Map<string, number>();
            candidates.forEach((c) => {
              if (c.listingClass) {
                listingClassFreq.set(c.listingClass, (listingClassFreq.get(c.listingClass) || 0) + 1);
              }
            });
            const listingClass = Array.from(listingClassFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

            let includeToken: string | null = null;
            const tokenFreq = new Map<string, number>();
            uniqueLinks.forEach((href) => {
              try {
                const pathname = new URL(href).pathname.toLowerCase();
                pathname
                  .split("/")
                  .filter((x) => x && x.length > 2)
                  .forEach((seg) => tokenFreq.set(seg, (tokenFreq.get(seg) || 0) + 1));
              } catch {
                // ignore
              }
            });
            includeToken = Array.from(tokenFreq.entries())
              .sort((a, b) => b[1] - a[1])
              .find(([seg]) => eventWords.some((kw: string) => seg.includes(kw)))?.[0] || null;

            let eventLinkSelector = "a[href]";
            if (sharedClass && (classFreq.get(sharedClass) || 0) >= 2) {
              eventLinkSelector = `a.${sharedClass.replace(/\s+/g, ".")}`;
            } else if (includeToken) {
              eventLinkSelector = `a[href*="/${includeToken}/"]`;
            }

            let nextPageSelector: string | null = null;
            const relNext = document.querySelector('a[rel="next"]') as HTMLAnchorElement | null;
            if (relNext) {
              nextPageSelector = 'a[rel="next"]';
            } else {
              const nextAnchor = allAnchors.find((a) => {
                const text = (a.textContent || "").trim().toLowerCase();
                const href = (a.getAttribute("href") || "").toLowerCase();
                return nextWords.some((kw: string) => text.includes(kw)) || href.includes("page=") || href.includes("/page/");
              });

              if (nextAnchor) {
                if (nextAnchor.id) {
                  nextPageSelector = `a#${nextAnchor.id}`;
                } else if (nextAnchor.classList.length > 0) {
                  nextPageSelector = `a.${Array.from(nextAnchor.classList).slice(0, 2).join(".")}`;
                } else {
                  nextPageSelector = 'a[href*="page="]';
                }
              }
            }

            const includePattern = includeToken ? `/${includeToken}/` : null;
            const excludePattern = "/tag/|/author/|/category/|/login|/privacy|/cookie";

            const confidence = Math.min(
              100,
              Math.max(
                0,
                uniqueLinks.length * 3 + (nextPageSelector ? 20 : 0) + (listingClass ? 10 : 0),
              ),
            );

            return {
              scannedUrl: window.location.href,
              listUrl: window.location.href,
              candidateUrls: navCandidateUrls,
              eventLinkSelector,
              nextPageSelector,
              includePattern,
              excludePattern,
              listingSelector: listingClass ? `.${listingClass}` : null,
              sampleEventUrl: uniqueLinks[0] || null,
              candidateCount: uniqueLinks.length,
              confidence,
            };
          },
          { eventKeywords: EVENT_KEYWORDS, nextKeywords: NEXT_KEYWORDS },
        )) as {
          scannedUrl: string;
          listUrl: string;
          candidateUrls: string[];
          eventLinkSelector: string;
          nextPageSelector: string | null;
          includePattern: string | null;
          excludePattern: string | null;
          listingSelector: string | null;
          sampleEventUrl: string | null;
          candidateCount: number;
          confidence: number;
        };

        analysis.candidateUrls
          .filter((u) => u.startsWith("http"))
          .forEach((u) => candidateUrls.add(u));

        return {
          scannedUrl: analysis.scannedUrl,
          listUrl: analysis.listUrl,
          eventLinkSelector: analysis.eventLinkSelector,
          nextPageSelector: analysis.nextPageSelector,
          includePattern: analysis.includePattern,
          excludePattern: analysis.excludePattern,
          listingSelector: analysis.listingSelector,
          sampleEventUrl: analysis.sampleEventUrl,
          confidence: analysis.confidence,
          candidateCount: analysis.candidateCount,
        };
      } catch {
        return null;
      }
    };

    const analyses: PageAnalysis[] = [];
    const first = await openAndAnalyze(seedUrl);
    if (first) {
      analyses.push(first);
    }

    const extraCandidates = Array.from(candidateUrls)
      .filter((url) => url !== seedUrl)
      .filter((url) => EVENT_KEYWORDS.some((kw) => url.toLowerCase().includes(kw)))
      .slice(0, 3);

    for (const url of extraCandidates) {
      const result = await openAndAnalyze(url);
      if (result) {
        analyses.push(result);
      }
    }

    const best = pickBest(analyses);
    if (!best) {
      return null;
    }

    const safeInclude = best.includePattern
      ? escapeRegex(best.includePattern.replace(/^\/+|\/+$/g, ""))
      : null;

    const notes = [
      "Auto-discovery completata.",
      best.listingSelector ? `listingSelector: ${best.listingSelector}` : null,
      best.sampleEventUrl ? `sampleEventUrl: ${best.sampleEventUrl}` : null,
      `confidence: ${best.confidence}`,
      `scannedUrl: ${best.scannedUrl}`,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      listUrl: best.listUrl,
      eventLinkSelector: best.eventLinkSelector,
      nextPageSelector: best.nextPageSelector,
      includePattern: safeInclude || best.includePattern || null,
      excludePattern: best.excludePattern || null,
      listingSelector: best.listingSelector,
      sampleEventUrl: best.sampleEventUrl,
      confidence: best.confidence,
      notes,
    };
  } catch {
    return null;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
  }
}

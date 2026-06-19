import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "../../../../lib/auth-helpers";
import { closeBrowser, getBrowser } from "../../../../../lib/browser-vercel";

function parseRequiredUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function clampWaitMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1500;
  return Math.max(0, Math.min(10000, Math.round(parsed)));
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    let payload: { url?: unknown; waitMs?: unknown; listingContainerSelector?: unknown };
    try {
      payload = (await request.json()) as { url?: unknown; waitMs?: unknown; listingContainerSelector?: unknown };
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const url = parseRequiredUrl(payload.url);
    if (!url) {
      return NextResponse.json({ error: "url non valido" }, { status: 400 });
    }

    const waitMs = clampWaitMs(payload.waitMs);
    const listingContainerSelector =
      typeof payload.listingContainerSelector === "string" && payload.listingContainerSelector.trim()
        ? payload.listingContainerSelector.trim()
        : null;
    let browser: any = null;

    try {
      browser = await getBrowser({
        headless: true,
        timeout: 45000,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const result = await page.evaluate(({ listingContainer }: { listingContainer: string | null }) => {
        // ---- Regex constants ----
        const EVENT_DATE_RE =
          /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b|\b\d{1,2}\s+(gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:tembre)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}\b/i;
        const EVENT_KW_RE =
          /event|concert|show|spettacol|festival|mostra|teatro|music|exhib|perform|evento|card|item|result|listing|entry|ticket/i;
        const NAV_KW_RE =
          /\b(nav|menu|header|footer|sidebar|widget|social|share|tag|categor|breadcrumb|topbar|toolbar|search|cookie|modal|popup|logo|login|signup|banner)\b/i;

        // ---- Collect visible anchor elements (scoped to container if provided) ----
        const searchRoot: Element = listingContainer
          ? (document.querySelector(listingContainer) ?? document.body)
          : document.body;

        const allAnchors: HTMLAnchorElement[] = Array.from(
          searchRoot.querySelectorAll("a[href]"),
        ).filter((el) => {
          const a = el as HTMLAnchorElement;
          const href = a.getAttribute("href") || "";
          if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("javascript:") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
          )
            return false;
          // Exclude anchors with zero dimensions (hidden / display:none)
          const rect = a.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        }) as HTMLAnchorElement[];

        // ---- Ancestor signature ----
        function getAncestorSig(el: Element, maxDepth: number): string {
          const parts: string[] = [];
          let cur: Element | null = el.parentElement;
          for (let i = 0; i < maxDepth; i++) {
            if (!cur || cur.tagName === "BODY" || cur.tagName === "HTML") break;
            const tag = cur.tagName.toLowerCase();
            const firstCls =
              cur.className && typeof cur.className === "string"
                ? cur.className.trim().split(/\s+/)[0] || ""
                : "";
            parts.push(firstCls ? `${tag}.${firstCls}` : tag);
            cur = cur.parentElement;
          }
          return parts.join(">");
        }

        // ---- Group anchors by signature ----
        const groups = new Map<string, HTMLAnchorElement[]>();
        for (const a of allAnchors) {
          const sig = getAncestorSig(a, 4);
          if (!groups.has(sig)) groups.set(sig, []);
          groups.get(sig)!.push(a);
        }

        // ---- Score a group ----
        function scoreGroup(sig: string, elements: HTMLAnchorElement[]): number {
          const count = elements.length;
          if (count < 3) return -Infinity;
          let score = 0;

          // Size scoring
          if (count >= 5 && count <= 40) score += 20;
          else if (count >= 3) score += 10;
          else if (count > 40) score += Math.max(0, 20 - (count - 40) / 5);

          // Link variety (nav bars often repeat same links)
          const hrefs = new Set<string>(
            elements.map((a) => {
              try {
                return new URL(a.href, window.location.href).pathname;
              } catch {
                return "";
              }
            }),
          );
          score += (hrefs.size / count) * 10;

          // Date text nearby
          const sample = elements.slice(0, 8);
          let dateCount = 0;
          for (const a of sample) {
            const container =
              a.closest("article, li, [class*='card'], [class*='item'], [class*='event']") ||
              a.parentElement?.parentElement ||
              a.parentElement;
            if (container && EVENT_DATE_RE.test((container as HTMLElement).innerText || ""))
              dateCount++;
          }
          score += (dateCount / sample.length) * 20;

          // Event keywords in ancestor signature
          if (EVENT_KW_RE.test(sig)) score += 15;

          // Image nearby
          let imgCount = 0;
          for (const a of sample) {
            const container =
              a.closest("article, li, [class*='card'], [class*='item']") || a.parentElement;
            if (container?.querySelector("img")) imgCount++;
          }
          score += (imgCount / sample.length) * 8;

          // Penalty for navigation / utility sections
          if (NAV_KW_RE.test(sig)) score -= 30;

          // Bonus if inside main content area
          if (
            elements[0].closest(
              'main, [role="main"], article, section, .content, #content, #main',
            )
          )
            score += 5;

          return score;
        }

        // ---- Find best group ----
        let bestScore = -Infinity;
        let bestElements: HTMLAnchorElement[] = [];
        for (const [sig, elements] of groups) {
          const s = scoreGroup(sig, elements);
          if (s > bestScore) {
            bestScore = s;
            bestElements = elements;
          }
        }

        // ---- Generate CSS selector from best group (card/container level) ----
        function generateEventSelector(elements: HTMLAnchorElement[]): string {
          if (!elements.length) return "a[href]";

          interface Candidate {
            sel: string;
            count: number;
            score: number;
          }
          const candidates: Candidate[] = [];

          // Helper: does this selector match card-level containers (not wrappers or body)?
          function isCardLevel(sel: string, totalLinks: number): number | null {
            try {
              const nodes = document.querySelectorAll(sel);
              const cnt = nodes.length;
              if (cnt < 3 || cnt > 200) return null;
              // Each card should contain at least one link
              let withLink = 0;
              nodes.forEach((n) => { if (n.querySelector("a[href]")) withLink++; });
              if (withLink / cnt < 0.5) return null;
              // Avoid selectors that match too many more than our event links
              if (cnt > totalLinks * 3) return null;
              return cnt;
            } catch {
              return null;
            }
          }

          const totalLinks = elements.length;

          // Strategy 1: Look for ancestor with event/card keyword class (card container)
          for (const a of elements.slice(0, 8)) {
            let cur: Element | null = a.parentElement;
            for (let depth = 0; depth < 6; depth++) {
              if (!cur || cur.tagName === "BODY" || cur.tagName === "HTML") break;
              if (cur.className && typeof cur.className === "string") {
                for (const cls of cur.className.trim().split(/\s+/)) {
                  if (!cls) continue;
                  if (EVENT_KW_RE.test(cls)) {
                    const tag = cur.tagName.toLowerCase();
                    // Try tag+class first (more specific), then just class
                    for (const sel of [`${tag}.${CSS.escape(cls)}`, `.${CSS.escape(cls)}`]) {
                      const cnt = isCardLevel(sel, totalLinks);
                      if (cnt !== null)
                        candidates.push({ sel, count: cnt, score: 15 - depth });
                    }
                  }
                }
              }
              // Also try semantic card containers by tag
              const tag = cur.tagName.toLowerCase();
              if (tag === "article" || tag === "li") {
                const cls =
                  cur.className && typeof cur.className === "string"
                    ? cur.className.trim().split(/\s+/)[0]
                    : "";
                const sel = cls ? `${tag}.${CSS.escape(cls)}` : tag;
                const cnt = isCardLevel(sel, totalLinks);
                if (cnt !== null)
                  candidates.push({ sel, count: cnt, score: tag === "article" ? 12 - depth : 8 - depth });
              }
              cur = cur.parentElement;
            }
          }

          // Strategy 2: Most common immediate parent signature as card
          const parentSigs = new Map<string, number>();
          for (const a of elements) {
            let cur: Element | null = a.parentElement;
            // Walk up to find a repeating card-level ancestor
            for (let d = 0; d < 4; d++) {
              if (!cur || cur.tagName === "BODY") break;
              const tag = cur.tagName.toLowerCase();
              const cls =
                cur.className && typeof cur.className === "string"
                  ? cur.className.trim().split(/\s+/)[0]
                  : "";
              const key = cls ? `${tag}.${CSS.escape(cls)}` : tag;
              parentSigs.set(key, (parentSigs.get(key) || 0) + 1);
              cur = cur.parentElement;
            }
          }
          for (const [sig, freq] of parentSigs) {
            if (freq >= elements.length * 0.6) {
              const cnt = isCardLevel(sig, totalLinks);
              if (cnt !== null)
                candidates.push({ sel: sig, count: cnt, score: 10 * (freq / elements.length) });
            }
          }

          // Strategy 3: semantic tag fallback (article, li with class)
          const tagCounts: Record<string, number> = {};
          for (const a of elements) {
            const card = a.closest("article, li, [class*='card'], [class*='item'], [class*='event']");
            if (card) {
              const tag = card.tagName.toLowerCase();
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
          for (const [tag, freq] of Object.entries(tagCounts)) {
            if (freq >= elements.length * 0.6) {
              const cnt = isCardLevel(tag, totalLinks);
              if (cnt !== null)
                candidates.push({ sel: tag, count: cnt, score: tag === "article" ? 7 : 3 });
            }
          }

          if (candidates.length) {
            candidates.sort((a, b) => b.score - a.score || a.count - b.count);
            return candidates[0].sel;
          }
          // Ultimate fallback: direct anchor selector
          return "a[href]";
        }

        const eventLinkSelector = generateEventSelector(bestElements);

        // ---- Pagination detection: prefer block/container selectors ----
        const ARROW_RE_PG = /[›»→▶>]|\bnext\b|\bsuccessiv|\bavanti\b|\bdopo\b/i;
        const NUMBER_RE_PG = /^\s*\d+\s*$/;

        function blockHasPagination(el: Element): boolean {
          if (el.querySelector('a[rel="next"]')) return true;
          if (el.querySelector('a[aria-label*="next" i], a[aria-label*="successiv" i]')) return true;
          if (el.querySelector('a[href*="page="]')) return true;
          for (const a of Array.from(el.querySelectorAll('a'))) {
            const txt = (a.textContent || '').trim();
            if (NUMBER_RE_PG.test(txt) || ARROW_RE_PG.test(txt)) return true;
            // image-only link = prev/next arrow button
            if (txt === '' && a.querySelector('img, svg')) return true;
          }
          return false;
        }

        const blockCandidates = [
          '.pagination',
          '[class*="pagination"]',
          '[class*="pager"]',
          'nav[aria-label*="page" i]',
          'nav[aria-label*="pagina" i]',
          '.page-numbers',
          '[class*="page-numbers"]',
          'ul.pages',
          '[role="navigation"]',
        ];

        let nextPageSelector: string | null = null;
        for (const sel of blockCandidates) {
          try {
            const el = document.querySelector(sel);
            if (el && blockHasPagination(el)) {
              nextPageSelector = sel;
              break;
            }
          } catch {}
        }

        // Fallback: direct next-link selectors
        if (!nextPageSelector) {
          const directSelectors = [
            'a[rel="next"]',
            'a[aria-label*="next" i]',
            'a[aria-label*="successiv" i]',
            'a[aria-label*="prossim" i]',
          ];
          for (const sel of directSelectors) {
            try {
              if (document.querySelector(sel)) { nextPageSelector = sel; break; }
            } catch {}
          }
        }

        let eventCount = 0;
        try {
          eventCount = document.querySelectorAll(eventLinkSelector).length;
        } catch {}

        return {
          eventLinkSelector,
          listingContainerSelector: listingContainer,
          eventCount,
          nextPageSelector,
          sampleLinks: bestElements
            .slice(0, 8)
            .map((a) => {
              try {
                return new URL(a.href, window.location.href).toString();
              } catch {
                return "";
              }
            })
            .filter(Boolean),
        };
      }, { listingContainer: listingContainerSelector });

      return NextResponse.json({ ok: true, result });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Generazione selettori fallita",
          details: error instanceof Error ? error.message : "Errore sconosciuto",
        },
        { status: 500 },
      );
    } finally {
      if (browser) await closeBrowser(browser);
    }
  });
}

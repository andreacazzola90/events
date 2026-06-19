import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "../../../../lib/auth-helpers";
import { closeBrowser, getBrowser } from "../../../../../lib/browser-vercel";

type InspectPayload = {
  url?: string;
  eventLinkSelector?: string;
  listingContainerSelector?: string;
  nextPageSelector?: string;
  waitMs?: number;
};

function parseRequiredUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseSelector(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseOptionalSelector(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampWaitMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 4000;
  }
  return Math.max(0, Math.min(30000, Math.round(parsed)));
}

async function dismissCookieBanner(page: any): Promise<void> {
  const ACCEPT_SELECTORS = [
    "#iubenda-cs-accept-btn",
    ".iubenda-cs-accept-btn",
    "button[id*='accept']",
    "button[class*='accept']",
    "a[id*='accept']",
    "a[class*='accept']",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button[id*='cookie'][id*='accept']",
    ".cc-accept",
    "#accept-all",
  ];
  const ACCEPT_TEXT_RE = /^(accetta|accept all|accept|accetto|ok,?\s*accetto|ho capito|consenti tutto)$/i;
  try {
    for (const sel of ACCEPT_SELECTORS) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await new Promise((r) => setTimeout(r, 600));
        return;
      }
    }
    const btns = await page.$$("button, a[role='button']");
    for (const btn of btns) {
      try {
        const text: string = await btn.evaluate((el: Element) => (el.textContent || "").trim());
        if (ACCEPT_TEXT_RE.test(text)) {
          await btn.click();
          await new Promise((r) => setTimeout(r, 600));
          return;
        }
      } catch { /* ignore */ }
    }
  } catch { /* banner not present or already dismissed */ }
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    let payload: InspectPayload;
    try {
      payload = (await request.json()) as InspectPayload;
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const url = parseRequiredUrl(payload.url);
    if (!url) {
      return NextResponse.json({ error: "url non valido" }, { status: 400 });
    }

    const eventLinkSelector = parseSelector(payload.eventLinkSelector, "a[href]");
    const listingContainerSelector = parseOptionalSelector(payload.listingContainerSelector);
    const nextPageSelector = parseOptionalSelector(payload.nextPageSelector);
    const waitMs = clampWaitMs(payload.waitMs);

    let browser: any = null;

    try {
      browser = await getBrowser({
        headless: true,
        timeout: 60000,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

      // iubenda and other cookie banners load lazily — wait 2s before trying to dismiss
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await dismissCookieBanner(page);

      // For SPAs (Angular/React/Deskline web components), wait for rendering
      const effectiveWait = Math.max(waitMs, 4000);
      await new Promise((resolve) => setTimeout(resolve, effectiveWait));

      // ---------- COLLECT DATA ----------
      const data = await page.evaluate(
        ({ eventSelector, listingContainer, nextSelector }: { eventSelector: string; listingContainer: string | null; nextSelector: string | null }) => {
          const toAbs = (href: string) => {
            try { return new URL(href, window.location.href).toString(); } catch { return ""; }
          };

          // ── Shadow DOM piercing utilities ─────────────────────────────────
          // Recursively query through all shadow roots in the document
          function shadowQueryAll(selector: string, root: Document | Element | ShadowRoot = document): Element[] {
            let results: Element[] = [];
            try { results = Array.from(root.querySelectorAll(selector)); } catch { /* invalid selector */ }
            const hosts = Array.from((root as any).querySelectorAll ? (root as any).querySelectorAll("*") : []) as Element[];
            for (const host of hosts) {
              if ((host as any).shadowRoot) {
                results = results.concat(shadowQueryAll(selector, (host as any).shadowRoot));
              }
            }
            return results;
          }
          function shadowQuery(selector: string, root: Document | Element | ShadowRoot = document): Element | null {
            try {
              const direct = (root as any).querySelector(selector) as Element | null;
              if (direct) return direct;
            } catch { /* ignore */ }
            const hosts = Array.from((root as any).querySelectorAll ? (root as any).querySelectorAll("*") : []) as Element[];
            for (const host of hosts) {
              if ((host as any).shadowRoot) {
                const found = shadowQuery(selector, (host as any).shadowRoot);
                if (found) return found;
              }
            }
            return null;
          }

          // Restrict search to listing container if provided (search through shadow DOM)
          const listingRoot = listingContainer ? shadowQuery(listingContainer) ?? undefined : undefined;

          // Events — search through shadow DOM
          let eventNodes: Element[] = [];
          try {
            eventNodes = listingRoot
              ? shadowQueryAll(eventSelector, listingRoot)
              : shadowQueryAll(eventSelector);
          } catch { eventNodes = []; }

          const eventLinks = eventNodes
            .map((node) => {
              if (node instanceof HTMLAnchorElement) return toAbs(node.href);
              const a = node.querySelector("a[href]") as HTMLAnchorElement | null
                ?? (shadowQuery("a[href]", node) as HTMLAnchorElement | null);
              return a ? toAbs((a as HTMLAnchorElement).href) : "";
            })
            .filter((href) => href.startsWith("http"));
          const uniqueEventLinks = Array.from(new Set(eventLinks));

          // Next page — search through shadow DOM
          let nextPageHref: string | null = null;
          let nextMatched = false;
          if (nextSelector) {
            const nextNode = (shadowQuery(nextSelector) as HTMLElement | null);
            if (nextNode) {
              nextMatched = true;
              if (nextNode instanceof HTMLAnchorElement && nextNode.href && !nextNode.href.endsWith("#")) {
                nextPageHref = toAbs(nextNode.href);
              } else {
                const FIRST_LAST_RE_I = /prima\s*pagina|ultima\s*pagina|first\s*page|last\s*page|go\s+to\s+first|go\s+to\s+last/i;
                const ARROW_RE_I = /[›»→▶>]|\bnext\b|\bsuccessiv|\bavanti\b|\bdopo\b/i;
                const relN = (shadowQuery('a[rel="next"]', nextNode) as HTMLAnchorElement | null);
                if (relN?.href) {
                  nextPageHref = toAbs(relN.href);
                } else {
                  // 1. Numbered: find active page then page+1 (preferred over arrows)
                  const active = (shadowQuery(".active > a, a.active, [aria-current='page']", nextNode) as HTMLElement | null);
                  if (active) {
                    const curNum = parseInt((active.textContent || "").trim(), 10);
                    if (!isNaN(curNum)) {
                      for (const a of Array.from(shadowQueryAll("a[href]", nextNode)) as HTMLAnchorElement[]) {
                        if (parseInt((a.textContent || "").trim(), 10) === curNum + 1) {
                          nextPageHref = toAbs(a.href);
                          break;
                        }
                      }
                    }
                  }
                  // 2. aria-label "next/successiv" — exclude first/last page arrows
                  if (!nextPageHref) {
                    const ariaN = (shadowQuery('a[aria-label*="next" i], a[aria-label*="successiv" i]', nextNode) as HTMLAnchorElement | null);
                    if (ariaN?.href && !FIRST_LAST_RE_I.test(ariaN.getAttribute("aria-label") || "")) {
                      nextPageHref = toAbs(ariaN.href);
                    }
                  }
                  // 3. Arrow/text pattern — exclude double arrows (first/last page)
                  if (!nextPageHref) {
                    for (const a of Array.from(shadowQueryAll("a[href]", nextNode)) as HTMLAnchorElement[]) {
                      const txt = (a.textContent || "").trim();
                      const aria = (a.getAttribute("aria-label") || "").trim();
                      if (FIRST_LAST_RE_I.test(aria) || FIRST_LAST_RE_I.test(txt)) continue;
                      const svgType = a.querySelector("svg")?.getAttribute("type") || "";
                      if (/double/i.test(svgType)) continue;
                      if (ARROW_RE_I.test(txt) || ARROW_RE_I.test(aria)) {
                        nextPageHref = toAbs(a.href);
                        break;
                      }
                    }
                  }
                }
              }
            }
          }

          const suggestedNextSelectors = [
            'a[rel="next"]',
            'a[aria-label*="next" i]',
            'a[href*="page="]',
            '.pagination a.next',
            'a.next',
          ].filter((sel) => { try { return !!shadowQuery(sel); } catch { return false; } });

          // ---------- PAGINATION TYPE DETECTION ----------
          const ARROW_RE = /[›»→▶>]|next|succ|avanti|forward|dopo/i;
          const NUMBER_RE = /^\s*\d+\s*$/;

          function isImgOnlyLink(el: Element): boolean {
            const text = (el.textContent || "").trim();
            return text === "" && !!el.querySelector("img, svg");
          }

          let hasArrows = false;
          let hasNumbers = false;
          let hasLoadMore = false;

          const interactives = shadowQueryAll("button, a");
          hasLoadMore = interactives.some((el) =>
            /carica\s*altri|load\s*more|mostra\s*altri|vedi\s*altri/i.test(el.textContent || ""),
          );

          const paginationContainers = shadowQueryAll(
            '.pagination, [class*="pagination"], [class*="pager"], nav[aria-label*="pagina" i], nav[aria-label*="page" i], dw-gen-pagination',
          );

          for (const container of paginationContainers) {
            for (const el of Array.from(container.querySelectorAll("a, button"))) {
              const text = (el.textContent || "").trim();
              const aria = (el.getAttribute("aria-label") || "").trim();
              if (ARROW_RE.test(text) || ARROW_RE.test(aria) || isImgOnlyLink(el)) hasArrows = true;
              if (NUMBER_RE.test(text)) hasNumbers = true;
            }
          }

          if (!hasArrows && !hasNumbers) {
            for (const link of shadowQueryAll("a[href]")) {
              const rel = link.getAttribute("rel") || "";
              const text = (link.textContent || "").trim();
              if (rel === "next" || rel === "prev" || ARROW_RE.test(text) || isImgOnlyLink(link)) {
                hasArrows = true;
                break;
              }
            }
          }

          let paginationType = "none";
          if (hasLoadMore) paginationType = "load-more";
          else if (hasArrows && hasNumbers) paginationType = "arrows+numbered";
          else if (hasArrows) paginationType = "arrows";
          else if (hasNumbers) paginationType = "numbered";

          return {
            scannedUrl: window.location.href,
            title: document.title,
            eventLinkSelector: eventSelector,
            eventMatches: eventNodes.length,
            eventLinksFound: uniqueEventLinks.length,
            sampleEventLinks: uniqueEventLinks.slice(0, 10),
            nextPageSelector: nextSelector,
            nextPageMatched: nextMatched,
            nextPageHref,
            suggestedNextSelectors,
            paginationType,
          };
        },
        { eventSelector: eventLinkSelector, listingContainer: listingContainerSelector, nextSelector: nextPageSelector },
      );

      // ---------- INJECT VISUAL OVERLAYS ----------
      await page.evaluate(
        ({ eventSelector, nextSelector }: { eventSelector: string; nextSelector: string | null }) => {
          const safeQuery = (sel: string): Element[] => {
            try { return Array.from(document.querySelectorAll(sel)); } catch { return []; }
          };

          // Remove any previous overlay container
          document.getElementById("__cron_overlay__")?.remove();

          const container = document.createElement("div");
          container.id = "__cron_overlay__";
          container.style.cssText =
            "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483647;";
          document.documentElement.appendChild(container);

          function addBox(el: Element, color: string, label: string) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const top = rect.top + window.scrollY;
            const left = rect.left + window.scrollX;

            const box = document.createElement("div");
            box.style.cssText = [
              `position:absolute`,
              `top:${top}px`,
              `left:${left}px`,
              `width:${rect.width}px`,
              `height:${rect.height}px`,
              `border:4px solid ${color}`,
              `background:${color}26`,
              `box-sizing:border-box`,
              `pointer-events:none`,
            ].join(";");

            const tag = document.createElement("span");
            tag.textContent = label;
            tag.style.cssText = [
              "position:absolute",
              "top:0",
              "left:0",
              `background:${color}`,
              "color:#000",
              "font-size:11px",
              "font-weight:700",
              "line-height:1",
              "padding:2px 6px",
              "border-radius:0 0 4px 0",
              "font-family:monospace",
              "white-space:nowrap",
            ].join(";");
            box.appendChild(tag);
            container.appendChild(box);
          }

          // Event cards
          safeQuery(eventSelector).forEach((el) => addBox(el, "#22c55e", "EVENTO"));

          // Pagination block + auto-discovered containers
          const pgSelectors: string[] = [
            'a[rel="next"]', 'a[rel="prev"]',
            'a[aria-label*="next" i]', 'a[aria-label*="prev" i]',
            'a[aria-label*="successiv" i]', 'a[aria-label*="precedent" i]',
            '.pagination', '[class*="pagination"]', '[class*="pager"]',
            'nav[aria-label*="pagina" i]', 'nav[aria-label*="page" i]',
          ];
          if (nextSelector) pgSelectors.unshift(nextSelector);

          const pgSeen = new Set<Element>();
          for (const sel of pgSelectors) {
            safeQuery(sel).forEach((el) => pgSeen.add(el));
          }
          pgSeen.forEach((el) => addBox(el, "#f59e0b", "PAGINAZIONE"));
        },
        { eventSelector: eventLinkSelector, nextSelector: nextPageSelector },
      );

      // ---------- SCREENSHOT ----------
      const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 75, fullPage: true });
      const screenshotBase64 = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer as Buffer).toString("base64")}`;

      return NextResponse.json({ ok: true, result: { ...data, screenshotBase64 } });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Analisi selettori fallita",
          details: error instanceof Error ? error.message : "Errore sconosciuto",
        },
        { status: 500 },
      );
    } finally {
      if (browser) await closeBrowser(browser);
    }
  });
}

